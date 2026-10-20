/*
 * Background service. Starts with Premiere Pro / After Effects, reads what you're
 * working on every few seconds and keeps your Discord status in sync.
 * Talks to the panel through small JSON files in the settings folder.
 */
(function () {
  var cs = new CSInterface();
  var env = cs.getHostEnvironment();
  var C = DP.Config;
  var P = DP.Presence;
  var A = DP.DiscordApp;
  var host = C.normalizeHost(env.appName);
  if (C.HOSTS.indexOf(host) < 0) return;

  function log(m) {
    C.log(host, m);
    try { console.log('[DiscordPresence] ' + m); } catch (e) {}
  }

  var settings = C.load();
  var settingsMtime = C.mtime(C.settingsPath());
  var ipc = new DP.DiscordIPC(C.clientId(settings, host));
  var tracker = new P.PlaybackTracker();
  var timeLog = new DP.TimeTrack.Tracker({
    read: function () { return C.readJSON(C.timePath(host), null); },
    write: function (d) { C.writeJSON(C.timePath(host), d); }
  });
  var updater = new DP.Updater.Updater({
    repo: C.dist().githubRepo,
    extDir: cs.getSystemPath(SystemPath.EXTENSION),
    dataDir: C.dataDir(),
    zip: DP.Zip,
    log: function (m) { log('Updater: ' + m); }
  });

  var st = {
    info: null,
    vars: {},
    mode: 'starting',
    activity: null,
    lastFp: '',
    lastChange: Date.now(),
    projectKey: null,
    projectStart: Date.now(),
    sessionStart: Date.now(),
    evalPending: false,
    evalAt: 0,
    lastPoll: 0,
    fastPending: false,
    fastAt: 0,
    playing: false,
    progress: null,
    lastSent: null,
    lastSendAt: 0,
    needSend: false,
    lastStatusWrite: 0,
    hostError: '',
    rpcError: '',
    appCache: C.readJSON(C.file('app-cache.json'), {}) || {},
    appInfo: null,
    appFetching: false,
    images: {},
    lastTick: Date.now(),
    countdown: null,
    timeLeft: 0,
    nextUpdateCheck: Date.now() + 15000,
    cmdNonce: (C.readJSON(C.commandPath(host), {}) || {}).nonce || null
  };

  ipc.on('state', function (s, detail) {
    log('Discord: ' + s + (detail ? ' — ' + detail : ''));
    if (s === 'connected') st.rpcError = '';
    writeStatus(true);
  });
  ipc.on('ready', function (user) {
    log('Connected to Discord' + (user && user.username ? ' as ' + user.username : ''));
  });
  ipc.on('rpcError', function (m) { st.rpcError = m; log('Discord rejected update: ' + m); writeStatus(true); });

  function appCfg() { return settings.apps[host]; }

  // --- Discord application info (name, icon, art assets) -------------------
  function refreshAppInfo(force) {
    var id = ipc.clientId;
    if (!id || st.appFetching) return;
    if (!force && st.appInfo && st.appInfo.id === id && Date.now() - st.appInfo.ts < A.TTL) return;
    st.appFetching = true;
    A.fetchInfo(id, st.appCache, !!force, function (info) {
      st.appFetching = false;
      if (id !== ipc.clientId) return;
      st.appInfo = info;
      try { C.writeJSON(C.file('app-cache.json'), st.appCache); } catch (e) {}
      log('Discord app: ' + (info.ok ? '"' + info.name + '", ' + info.assets.length + ' art assets' : 'lookup failed (' + info.error + ')'));
      st.lastSent = null;
      apply();
    });
  }

  // Swap asset names for something Discord can actually show.
  function fixImages(activity) {
    st.images = {};
    if (!activity || !activity.assets) return activity;
    var as = activity.assets;
    if (as.large_image) {
      var L = A.resolveImage(as.large_image, st.appInfo, true);
      st.images.large = L;
      if (L.value) as.large_image = L.value; else { delete as.large_image; delete as.large_text; }
    }
    if (as.small_image) {
      var S = A.resolveImage(as.small_image, st.appInfo, false);
      st.images.small = S;
      if (S.value) as.small_image = S.value; else { delete as.small_image; delete as.small_text; }
    }
    if (!as.large_image && !as.small_image) delete activity.assets;
    return activity;
  }

  // --- ExtendScript bridge -------------------------------------------------
  function loadJsx(cb) {
    cs.evalScript('typeof DiscordPresenceHost', function (r) {
      if (r === 'object') return cb && cb();
      var f = cs.getSystemPath(SystemPath.EXTENSION) + '/jsx/host.jsx';
      log('Loading host script manually: ' + f);
      cs.evalScript('$.evalFile(' + JSON.stringify(f) + ')', function () { if (cb) cb(); });
    });
  }

  function poll() {
    st.evalPending = true;
    st.evalAt = Date.now();
    cs.evalScript('DiscordPresenceHost.getInfo("' + host + '")', function (res) {
      st.evalPending = false;
      st.lastPoll = Date.now();
      var info = null;
      try { info = JSON.parse(res); } catch (e) { info = null; }
      if (info && info.error === 'busy') return; // e.g. a dialog is open in Photoshop — try again next time
      if (!info || info.error) {
        st.hostError = info && info.error ? info.error : 'Host script not ready (' + String(res).slice(0, 80) + ')';
        if (!info) loadJsx();
        return;
      }
      st.hostError = '';
      update(info);
    });
  }

  // Premiere only: sample the playhead every second to notice playback.
  function watchEnabled() { return host === 'PPRO' && !!appCfg().autoWatch; }

  function fastPoll() {
    st.fastPending = true;
    st.fastAt = Date.now();
    cs.evalScript('DiscordPresenceHost.playhead()', function (res) {
      st.fastPending = false;
      var now = Date.now();
      var parts = String(res || '').split('|');
      if (parts.length < 3) { tracker.reset(); return checkPlaying(now); }
      var pos = parseFloat(parts[1]);
      tracker.feed(parts[0], pos, now);
      if (st.info && tracker.playingFor(now) > 0) {
        st.info.playhead = pos;
        st.info.duration = parseFloat(parts[2]) || st.info.duration;
        st.lastChange = now; // playback counts as activity
      }
      checkPlaying(now);
    });
  }

  function checkPlaying(now) {
    var a = appCfg();
    var need = Math.max(1, parseFloat(a.watchAfterSeconds) || 10);
    var playing = watchEnabled() && tracker.playingFor(now) >= need;
    if (playing && st.info && st.info.duration > 0) {
      // Keep the progress bar stable: only move it if playback drifted > 3 s (seek, speed change).
      var start = Math.round(now - (st.info.playhead || 0) * 1000);
      if (!st.progress || Math.abs(st.progress.start - start) > 3000) {
        st.progress = { start: start, end: start + Math.round(st.info.duration * 1000) };
      }
    } else if (!playing) {
      st.progress = null;
    }
    if (playing !== st.playing) {
      st.playing = playing;
      log(playing ? 'Playback detected → watching' : 'Playback stopped');
      apply();
    } else if (playing) {
      apply();
    }
  }

  function update(info) {
    if (st.playing && st.info) { info.playhead = st.info.playhead; } // fast poll is fresher
    var fp = P.fingerprint(info);
    if (fp !== st.lastFp) { st.lastFp = fp; st.lastChange = Date.now(); }
    var key = info.hasProject ? info.project : '';
    if (key !== st.projectKey) {
      if (st.projectKey !== null) log('Project changed: ' + (key || '(none)'));
      st.projectKey = key;
      st.projectStart = Date.now();
    }
    st.info = info;
    apply();
  }

  function apply() {
    if (!st.info) return; // nothing read from the app yet — don't flash "home screen"
    var idleMs = (parseFloat(settings.idleMinutes) || 0) * 60000;
    var idle = idleMs > 0 && Date.now() - st.lastChange > idleMs;
    var mode = P.decideMode(st.info, appCfg(), settings, idle, st.playing);
    updateCountdown(mode);
    var key = timeKey();
    var vars = P.buildVars(host, st.info, settings, {
      version: env.appVersion,
      timeLeft: st.timeLeft,
      time: settings.trackTime ? { today: timeLog.today(), week: timeLog.week(), project: key ? timeLog.project(key) : 0 } : null
    });
    var start = settings.elapsed === 'session' ? st.sessionStart : st.projectStart;
    var activity = fixImages(P.buildActivity(host, mode, vars, settings, start, { progress: st.progress, countdown: st.countdown }));
    st.mode = mode;
    st.vars = vars;
    st.activity = activity;

    var json = JSON.stringify(activity);
    if (json === st.lastSent) return;
    // Discord allows ~5 updates per 20 s; keep a little headroom.
    if (Date.now() - st.lastSendAt < 4000) { st.needSend = true; return; }
    st.needSend = false;
    st.lastSent = json;
    st.lastSendAt = Date.now();
    ipc.setActivity(activity);
    writeStatus(true);
  }

  // Media Encoder: estimate when the current item finishes from its progress.
  function updateCountdown(mode) {
    var i = st.info;
    if (host !== 'AME' || mode !== 'rendering' || !i || !(i.progress > 0.02) || !i.itemStarted) {
      st.countdown = null; st.timeLeft = 0; return;
    }
    var now = Date.now();
    var end = Math.round(i.itemStarted + (now - i.itemStarted) / i.progress);
    if (!st.countdown || st.countdown.start !== i.itemStarted || Math.abs(st.countdown.end - end) > 15000) {
      st.countdown = { start: i.itemStarted, end: end };
    }
    st.timeLeft = Math.max(0, (st.countdown.end - now) / 1000);
  }

  // Which bucket active time goes into.
  function timeKey() {
    if (!st.info || !st.info.hasProject) return '';
    return host === 'AME' ? 'Exports' : st.info.project || '';
  }

  function trackTime(now) {
    var dt = Math.min(5, (now - st.lastTick) / 1000);
    st.lastTick = now;
    if (!settings.trackTime) return;
    if (st.mode !== 'active' && st.mode !== 'watching' && st.mode !== 'rendering') return;
    timeLog.add(timeKey(), dt, now);
    timeLog.save(false);
  }

  // --- Updates ---------------------------------------------------------------
  function checkUpdates(manual) {
    if (!updater.enabled()) return;
    var u = settings.updates || {};
    if (!manual && !u.check) return;
    updater.check(function (err, state) {
      writeStatus(true);
      if (err) return log('Update check: ' + err.message);
      log('Update check: latest ' + state.latest + (state.available ? ' (available)' : ' (up to date)'));
      if (state.available && (u.auto || manual === 'install')) installUpdate();
    });
  }

  function installUpdate() {
    updater.install(function () { writeStatus(true); });
    writeStatus(true);
  }

  // --- Panel communication -------------------------------------------------
  function applyClientId() {
    var id = C.clientId(settings, host);
    if (id !== ipc.clientId) {
      st.rpcError = '';
      st.appInfo = null;
      ipc.setClientId(id);
      refreshAppInfo(false);
    }
  }

  function checkSettings() {
    var m = C.mtime(C.settingsPath());
    if (m === settingsMtime) return;
    settingsMtime = m;
    settings = C.load();
    log('Settings reloaded');
    applyClientId();
    if (!watchEnabled()) { tracker.reset(); st.playing = false; st.progress = null; }
    st.lastSent = null;
    apply();
  }

  function checkCommand() {
    var cmd = C.readJSON(C.commandPath(host), null);
    if (!cmd || !cmd.nonce || cmd.nonce === st.cmdNonce) return;
    st.cmdNonce = cmd.nonce;
    log('Command: ' + cmd.cmd);
    if (cmd.cmd === 'reconnect') {
      st.rpcError = '';
      ipc.disconnect();
      ipc._nextRetry = 0;
      ipc._retryDelay = 3000;
      st.lastSent = null;
      ipc.connect();
      st.lastPoll = 0;
      refreshAppInfo(true); // also re-check images (e.g. you just uploaded one)
    } else if (cmd.cmd === 'refresh') {
      st.lastSent = null;
      st.lastPoll = 0;
      refreshAppInfo(true);
    } else if (cmd.cmd === 'checkUpdate') {
      checkUpdates(true);
    } else if (cmd.cmd === 'installUpdate') {
      if (updater.state.available) installUpdate(); else checkUpdates('install');
    } else if (cmd.cmd === 'poke') {
      st.lastChange = Date.now();
      st.lastPoll = 0;
    }
  }

  function writeStatus(force) {
    var now = Date.now();
    if (!force && now - st.lastStatusWrite < 2000) return;
    st.lastStatusWrite = now;
    var ai = st.appInfo;
    try {
      C.writeJSON(C.statusPath(host), {
        ts: now,
        host: host,
        appVersion: env.appVersion,
        discord: {
          state: ipc.state,
          error: ipc.state === 'error' ? ipc.lastError : st.rpcError,
          user: ipc.user ? { username: ipc.user.username, global_name: ipc.user.global_name } : null
        },
        hasClientId: !!ipc.clientId,
        clientId: ipc.clientId,
        usingBuiltin: !String(appCfg().clientId || '').trim() && !!ipc.clientId,
        app: ai ? { ok: ai.ok, error: ai.error, name: ai.name, iconUrl: ai.iconUrl,
          assets: (ai.assets || []).map(function (x) { return x.name; }) } : null,
        images: st.images,
        update: updater.enabled() ? updater.state : null,
        timeKey: timeKey(),
        mode: st.mode,
        playing: st.playing,
        activity: st.activity,
        vars: st.vars,
        info: st.info,
        hostError: st.hostError,
        idleSeconds: Math.round((now - st.lastChange) / 1000),
        projectStart: st.projectStart,
        sessionStart: st.sessionStart
      });
    } catch (e) {}
  }

  // --- Main loop -----------------------------------------------------------
  function tick() {
    try {
      checkSettings();
      checkCommand();
      if (ipc.clientId) { ipc.ensure(); refreshAppInfo(false); }
      var now = Date.now();
      var every = Math.max(2, Math.min(60, parseFloat(settings.pollSeconds) || 5)) * 1000;
      if (st.evalPending && now - st.evalAt > 45000) st.evalPending = false; // app was busy (e.g. rendering)
      if (st.fastPending && now - st.fastAt > 10000) st.fastPending = false;
      if (!st.evalPending && now - st.lastPoll >= every) poll();
      else if (watchEnabled() && !st.fastPending && st.info && st.info.hasProject) fastPoll();
      if (st.needSend && now - st.lastSendAt >= 4000) apply();
      trackTime(now);
      if (now >= st.nextUpdateCheck) { st.nextUpdateCheck = now + 6 * 3600000; checkUpdates(false); }
      writeStatus(false);
    } catch (e) {
      log('Tick error: ' + (e && e.stack || e));
    }
  }

  log('Service started in ' + host + ' ' + env.appVersion + ' (extension ' + updater.running + ')');
  if (!updateLockActive()) updater.cleanup();
  loadJsx(function () { poll(); });
  refreshAppInfo(false);
  setInterval(tick, 1000);

  function updateLockActive() {
    try { return Date.now() - DP.Config.mtime(C.file('update.lock')) < 10 * 60000; } catch (e) { return false; }
  }

  window.addEventListener('beforeunload', function () {
    try { timeLog.save(true); } catch (e) {}
    try { ipc.setActivity(null); ipc.disconnect(); } catch (e) {}
  });
})();
