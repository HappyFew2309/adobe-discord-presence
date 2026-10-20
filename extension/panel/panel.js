/*
 * Settings + live status panel. Edits settings.json (the background service picks
 * changes up within a second) and reads status-<HOST>.json to show what Discord sees.
 */
(function () {
  var cs = new CSInterface();
  var env = cs.getHostEnvironment();
  var C = DP.Config;
  var P = DP.Presence;
  var TT = DP.TimeTrack;
  var here = C.normalizeHost(env.appName); // the app this panel runs in
  if (C.HOSTS.indexOf(here) < 0) here = 'PPRO';
  var host = here; // the app whose settings are being edited (switchable)
  var nodeRequire = (window.cep_node && window.cep_node.require) || window.require;
  var BG_ID = 'com.happyfew.discordpresence.background';
  var TEXT_KEYS = ['details', 'state', 'idleDetails', 'idleState', 'noProjectDetails', 'noProjectState',
    'renderDetails', 'renderState', 'largeText', 'smallText'];
  var KICKER = { 0: 'Playing', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
  var VARS = {
    common: ['app', 'year', 'version', 'todayTime', 'projectTime', 'weekTime'],
    media: ['resolution', 'format', 'fps', 'duration', 'playhead', 'selectedText'],
    PPRO: ['project', 'sequence', 'clipsText', 'audioClipsText', 'videoTracksText', 'audioTracksText', 'sequencesText', 'itemsText', 'clips', 'sequences'],
    AEFT: ['project', 'comp', 'layersText', 'compsText', 'itemsText', 'item', 'rendering', 'queuedText', 'layers', 'comps'],
    PHXS: ['document', 'resolution', 'format', 'layersText', 'docsText', 'tool', 'colorMode', 'dpi', 'historyText', 'unsaved'],
    ILST: ['document', 'artboard', 'artboardsText', 'layersText', 'objectsText', 'docsText', 'resolution', 'colorMode', 'unsaved'],
    AUDT: ['document', 'docType', 'sampleRate', 'tracksText'],
    AME: ['file', 'output', 'progressText', 'timeLeft', 'doneText', 'failedText']
  };
  var MEDIA_HOSTS = { PPRO: 1, AEFT: 1 };
  var S = 'viewBox="0 0 24 24" fill="none" stroke="#c9ccff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var GLYPH = {
    PHXS: '<svg ' + S + '><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    ILST: '<svg ' + S + '><path d="M12 3l5 8-5 10-5-10 5-8z"/><circle cx="12" cy="11" r="1.5"/><path d="M12 3v6.5"/></svg>',
    AUDT: '<svg ' + S + '><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/></svg>',
    AME: '<svg ' + S + '><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
    PPRO: '<svg viewBox="0 0 24 24" fill="none" stroke="#c9ccff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4"/></svg>',
    AEFT: '<svg viewBox="0 0 24 24" fill="none" stroke="#c9ccff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/></svg>'
  };

  var $ = function (id) { return document.getElementById(id); };
  var settings = C.load();
  var settingsMtime = C.mtime(C.settingsPath());
  var status = null;
  var lastTemplateInput = null;
  var timers = {};

  // ---------- theme: follow the host app's panel color ----------
  function theme() {
    try {
      var c = env.appSkinInfo.panelBackgroundColor.color;
      var r = Math.round(c.red), g = Math.round(c.green), b = Math.round(c.blue);
      var root = document.documentElement;
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var shift = function (d) {
        var f = function (x) { return Math.max(0, Math.min(255, x + d)); };
        return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
      };
      root.style.setProperty('--bg', 'rgb(' + r + ',' + g + ',' + b + ')');
      root.classList.toggle('light', lum > 0.55);
      if (lum <= 0.55) {
        root.style.setProperty('--bg-2', shift(10));
        root.style.setProperty('--bg-3', shift(22));
        root.style.setProperty('--line', shift(28));
      }
    } catch (e) {}
  }
  theme();
  cs.addEventListener('com.adobe.csxs.events.ThemeColorChanged', function () {
    env = cs.getHostEnvironment();
    theme();
  });

  // ---------- settings binding ----------
  function pathOf(key) {
    var parts = key.split('.');
    if (parts[0] === 'app') parts = ['apps', host].concat(parts.slice(1));
    return parts;
  }
  function getKey(obj, key) {
    var p = pathOf(key), o = obj;
    for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; }
    return o;
  }
  function setKey(obj, key, val) {
    var p = pathOf(key), o = obj;
    for (var i = 0; i < p.length - 1; i++) {
      if (o[p[i]] == null) o[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {};
      o = o[p[i]];
    }
    o[p[p.length - 1]] = val;
  }

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.hasAttribute('data-list')) return el.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (el.type === 'number') { var n = parseFloat(el.value); return isFinite(n) ? n : 0; }
    if (el.tagName === 'SELECT' && /^\d+$/.test(el.value)) return parseInt(el.value, 10);
    return el.value;
  }

  function fillFields() {
    var els = document.querySelectorAll('[data-key]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === document.activeElement) continue;
      var v = getKey(settings, el.getAttribute('data-key'));
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.hasAttribute('data-list')) el.value = (v || []).join('\n');
      else el.value = v == null ? '' : String(v);
    }
    $('setupCard').hidden = !!C.clientId(settings, host);
  }

  function save(key, val) {
    var fresh = C.load(); // re-read so we never overwrite edits made from the other app
    setKey(fresh, key, val);
    try {
      C.save(fresh);
      settings = fresh;
      settingsMtime = C.mtime(C.settingsPath());
      toast('Saved');
    } catch (e) {
      toast('Could not save: ' + e.message);
    }
    // Keep duplicate fields (e.g. Client ID appears twice) in sync.
    var twins = document.querySelectorAll('[data-key="' + key + '"]');
    for (var i = 0; i < twins.length; i++) {
      if (twins[i] === document.activeElement) continue;
      if (twins[i].type === 'checkbox') twins[i].checked = !!val;
      else if (twins[i].hasAttribute('data-list')) twins[i].value = val.join('\n');
      else twins[i].value = val;
    }
    if (key === 'app.clientId') $('setupCard').hidden = !!C.clientId(settings, host);
    render();
  }

  function bindFields() {
    var els = document.querySelectorAll('[data-key]');
    for (var i = 0; i < els.length; i++) (function (el) {
      var key = el.getAttribute('data-key');
      var immediate = el.type === 'checkbox' || el.tagName === 'SELECT';
      el.addEventListener(immediate ? 'change' : 'input', function () {
        var val = readInput(el);
        if (key === 'app.clientId') val = String(val).replace(/\D/g, '');
        clearTimeout(timers[key]);
        if (immediate) save(key, val);
        else timers[key] = setTimeout(function () { save(key, val); }, 450);
        if (!immediate) renderPreviewWith(key, val);
      });
      if (el.hasAttribute('data-template')) {
        el.addEventListener('focus', function () { lastTemplateInput = el; });
      }
    })(els[i]);
  }

  // Live preview while typing, before the debounced save lands.
  function renderPreviewWith(key, val) {
    var copy = JSON.parse(JSON.stringify(settings));
    setKey(copy, key, val);
    render(copy);
  }

  // ---------- status + preview ----------
  function readStatus() {
    status = C.readJSON(C.statusPath(host), null);
    var m = C.mtime(C.settingsPath());
    if (m !== settingsMtime && !(document.activeElement && document.activeElement.hasAttribute('data-key'))) {
      settingsMtime = m;
      settings = C.load();
      fillFields();
    }
    render();
  }

  function serviceAlive() { return status && Date.now() - status.ts < 10000; }

  function startService() {
    try { cs.requestOpenExtension(BG_ID, ''); } catch (e) {}
  }

  function setPill(cls, text, title) {
    var pill = $('statusPill');
    pill.className = 'pill ' + cls;
    $('statusText').textContent = text;
    pill.title = title || '';
  }

  function note(msg, kind, action) {
    var el = $('note');
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'note' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    if (action) {
      var b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = action.label;
      b.onclick = action.run;
      el.appendChild(document.createElement('br'));
      el.appendChild(b);
    }
  }

  function renderStatus() {
    var a = settings.apps[host];
    if (!serviceAlive()) {
      if (host !== here) {
        setPill('', P.APP_LABEL[host] + ' closed');
        note('');
        return;
      }
      setPill('bad', 'Service stopped');
      note('The background service isn’t running in ' + P.APP_LABEL[host] + '.', '', { label: 'Start it', run: startService });
      return;
    }
    if (!settings.enabled || !a.enabled) {
      setPill('warn', 'Hidden');
      note('');
      return;
    }
    if (!status.hasClientId || !C.clientId(settings, host)) {
      setPill('warn', 'Needs setup');
      note('');
      return;
    }
    var d = status.discord || {};
    if (d.state === 'connected') {
      var who = d.user ? (d.user.global_name || d.user.username) : '';
      setPill('ok', 'Connected', who ? 'Signed in as ' + who : '');
      if (d.error) note('Discord rejected the last update: ' + d.error, 'warn');
      else if (status.hostError) note(status.hostError, 'warn');
      else note('');
    } else if (d.state === 'connecting' || d.state === 'idle') {
      setPill('busy', 'Connecting…');
      note('');
    } else {
      var notRunning = /not running/i.test(d.error || '');
      setPill('bad', notRunning ? 'Discord closed' : 'Error', d.error);
      note(notRunning
        ? 'Open the Discord desktop app — this connects automatically once it’s running. (The browser version of Discord can’t show Rich Presence.)'
        : d.error || 'Could not reach Discord.');
    }
  }

  function isUrl(s) { return /^https?:\/\//i.test(String(s || '').trim()); }

  function render(cfg) {
    cfg = cfg || settings;
    renderStatus();
    var info = status ? status.info : null;
    var vars = P.buildVars(host, info, cfg, { version: status && status.appVersion, time: timeFor(status) });
    var mode = P.decideMode(info, cfg.apps[host], cfg, !!(status && status.mode === 'idle'), !!(status && status.playing));
    var start = status ? (cfg.elapsed === 'session' ? status.sessionStart : status.projectStart) : Date.now();
    var sent = status && status.activity;
    var progress = sent && sent.timestamps && sent.timestamps.end ? sent.timestamps : null;
    if (mode === 'rendering' && sent && sent.state && status.vars) vars.timeLeft = status.vars.timeLeft;
    var act = P.buildActivity(host, mode, vars, cfg, start, { progress: progress, countdown: progress });
    var a = cfg.apps[host];

    var pv = $('preview');
    pv.classList.toggle('is-empty', !act);
    $('pvEmpty').hidden = !!act;
    $('pvEmpty').textContent = mode === 'idle' ? 'Idle — your status is hidden until you’re back.'
      : mode === 'hidden' ? 'Hidden until something is encoding.' : 'Nothing is showing on Discord right now.';
    if (act) {
      $('pvKicker').textContent = KICKER[parseInt(mode === 'watching' ? a.watchType : a.activityType, 10) || 0] || 'Playing';
      $('pvName').textContent = (status && status.app && status.app.name) || P.APP_LABEL[host];
      $('pvDetails').textContent = act.details || '';
      $('pvState').textContent = act.state || '';
      var large = $('pvLarge');
      var li = act.assets && act.assets.large_image;
      var resolved = status && status.images && status.images.large;
      var img = isUrl(li) ? li : (resolved && resolved.previewUrl) || '';
      large.classList.toggle('has-img', !!img);
      large.style.backgroundImage = img ? 'url("' + img.replace(/"/g, '%22') + '")' : '';
      large.title = (act.assets && act.assets.large_text) || '';
      if (!isUrl(li)) large.title = (li ? 'Art asset "' + li + '"' : 'No image') + (large.title ? ' — ' + large.title : '');
      var si = act.assets && act.assets.small_image;
      var sres = status && status.images && status.images.small;
      var simg = isUrl(si) ? si : (sres && sres.previewUrl) || '';
      $('pvSmall').hidden = !si;
      $('pvSmall').style.backgroundImage = simg ? 'url("' + simg.replace(/"/g, '%22') + '")' : '';
      $('pvSmall').title = (act.assets && act.assets.small_text) || (si ? 'Art asset "' + si + '"' : '');
      var btns = $('pvButtons');
      btns.innerHTML = '';
      (act.buttons || []).forEach(function (b) {
        var d = document.createElement('div');
        d.className = 'pv-btn';
        d.textContent = b.label;
        d.title = b.url;
        btns.appendChild(d);
      });
      pv.setAttribute('data-start', act.timestamps ? act.timestamps.start : '');
      pv.setAttribute('data-end', act.timestamps && act.timestamps.end ? act.timestamps.end : '');
    } else {
      pv.setAttribute('data-start', '');
      pv.setAttribute('data-end', '');
    }
    tickTime();
    renderVars(vars);
    renderImageNote(cfg);
    renderPrivate(cfg, info);
    renderUpdate();
  }

  // Today / week / project seconds for {todayTime} etc. (from the app's own time file).
  function timeFor(st) {
    try {
      var data = C.readJSON(C.timePath(host), null);
      if (!data) return null;
      var t = new TT.Tracker({ read: function () { return data; } });
      return { today: t.today(), week: t.week(), project: st && st.timeKey ? t.project(st.timeKey) : 0 };
    } catch (e) { return null; }
  }

  // ---------- privacy for the current project ----------
  function renderPrivate(cfg, info) {
    var row = $('privateRow');
    if (!info || !info.path || host === 'AME') { row.hidden = true; return; }
    row.hidden = false;
    var marked = (cfg.privateProjects || []).some(function (p) { return P.isPrivate({ path: info.path }, { privateProjects: [p] }); });
    var byRule = !marked && P.isPrivate(info, { privateFolders: cfg.privateFolders });
    $('privateText').textContent = '“' + info.project + '”: ' + (marked ? 'marked private' : byRule ? 'private (folder rule)' : cfg.privacy ? 'private (privacy mode)' : 'public');
    $('btnPrivate').textContent = marked ? 'Make public again' : 'Keep this project private';
    $('btnPrivate').hidden = byRule && !marked;
    $('btnPrivate').setAttribute('data-path', info.path);
    $('btnPrivate').setAttribute('data-marked', marked ? '1' : '');
  }

  $('btnPrivate').addEventListener('click', function () {
    var p = this.getAttribute('data-path');
    var marked = !!this.getAttribute('data-marked');
    var list = (C.load().privateProjects || []).filter(function (x) { return !P.isPrivate({ path: p }, { privateProjects: [x] }); });
    if (!marked) list.push(p);
    save('privateProjects', list);
  });

  // ---------- updates ----------
  function updateState() {
    // Any running app's service can report it; prefer the one this panel runs in.
    var best = null;
    C.HOSTS.forEach(function (h) {
      var st = h === host ? status : C.readJSON(C.statusPath(h), null);
      if (st && st.update && Date.now() - st.ts < 15000 && (!best || h === here)) best = st.update;
    });
    return best;
  }

  function renderUpdate() {
    var u = updateState();
    var banner = $('updateBanner');
    var repo = (C.dist() || {}).githubRepo;
    if (!repo) {
      $('updateText').textContent = 'Updates aren’t set up for this build.';
      $('btnCheckUpdate').hidden = true;
      banner.hidden = true;
      return;
    }
    $('btnCheckUpdate').hidden = false;
    if (!u) { $('updateText').textContent = 'Version —'; banner.hidden = true; return; }
    var line = 'Version ' + (u.running || '?');
    if (u.state === 'checking') line += ' · checking…';
    else if (u.state === 'downloading' || u.state === 'installing') line += ' · updating to ' + u.latest + '…';
    else if (u.restartNeeded) line += ' · ' + u.installed + ' installed, restart to finish';
    else if (u.available) line += ' · ' + u.latest + ' available';
    else if (u.state === 'error') line += ' · ' + u.error;
    else if (u.checkedAt) line += ' · up to date';
    $('updateText').textContent = line;

    var html = '';
    if (u.restartNeeded) {
      banner.className = 'banner ok';
      html = '<span class="grow">Updated to <b>' + esc(u.installed) + '</b>. Restart ' + esc(P.APP_LABEL[here]) + ' to finish.</span>';
    } else if (u.available && u.state !== 'downloading' && u.state !== 'installing') {
      banner.className = 'banner';
      html = '<span class="grow">Version <b>' + esc(u.latest) + '</b> is available.</span>' +
        (u.url ? '<a href="#" data-url="' + esc(u.url) + '">What’s new</a>' : '') +
        '<button class="btn small" id="btnInstallUpdate">Install</button>';
    } else if (u.state === 'error' && u.latest && u.url && /write|installer/i.test(u.error || '')) {
      banner.className = 'banner';
      html = '<span class="grow">' + esc(u.error) + '</span><a href="#" data-url="' + esc(u.url) + '">Open release</a>';
    }
    banner.hidden = !html;
    if (banner.getAttribute('data-html') !== html) {
      banner.setAttribute('data-html', html);
      banner.innerHTML = html;
      var b = $('btnInstallUpdate');
      if (b) b.onclick = function () { commandTo(here, 'installUpdate'); toast('Installing update…'); };
    }
  }

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $('btnCheckUpdate').addEventListener('click', function () { commandTo(here, 'checkUpdate'); toast('Checking for updates…'); });

  // ---------- time tab ----------
  function renderTime() {
    var byHost = {};
    C.HOSTS.forEach(function (h) { byHost[h] = C.readJSON(C.timePath(h), null); });
    var sum = TT.summarize(byHost);
    $('tToday').textContent = P.fmtDur(sum.today);
    $('tWeek').textContent = P.fmtDur(sum.week);
    var max = 1;
    sum.days.forEach(function (d) { max = Math.max(max, d.total); });
    var today = TT.dayKey(Date.now());
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('tDays').innerHTML = sum.days.map(function (d) {
      var parts = d.day.split('-');
      var dow = names[new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay()];
      return '<div class="day' + (d.day === today ? ' today' : '') + '" title="' + esc(d.day + ': ' + P.fmtDur(d.total)) + '">' +
        '<div class="day-bar" style="height:' + Math.round(70 * d.total / max) + 'px"></div><div class="day-label">' + dow + '</div></div>';
    }).join('');
    var top = sum.projects.slice(0, 8);
    var pmax = top.length ? top[0].week : 1;
    $('tProjects').innerHTML = top.length ? top.map(function (p) {
      return '<div class="proj"><div class="proj-name">' + esc(p.name) + '<span class="proj-app">' + esc(P.APP_LABEL[p.host] || p.host) + '</span></div>' +
        '<div class="proj-time">' + P.fmtDur(p.week) + '</div><div class="proj-bar"><div style="width:' + Math.max(2, Math.round(100 * p.week / pmax)) + '%"></div></div></div>';
    }).join('') : '<div class="empty">Nothing tracked yet — open a project and get to work.</div>';
  }

  function tickTime() {
    var start = parseInt($('preview').getAttribute('data-start'), 10);
    var end = parseInt($('preview').getAttribute('data-end'), 10);
    var bar = !!(start && end && end > start);
    $('pvProgress').hidden = !bar;
    $('pvTime').textContent = start && !bar ? P.fmtTime((Date.now() - start) / 1000) + ' elapsed' : '';
    if (bar) {
      var pos = Math.min(end - start, Math.max(0, Date.now() - start));
      $('pvFill').style.width = (100 * pos / (end - start)).toFixed(2) + '%';
      $('pvPos').textContent = P.fmtTime(pos / 1000);
      $('pvDur').textContent = P.fmtTime((end - start) / 1000);
    }
  }

  // Explain what happens with the image you typed (the #1 setup snag).
  function renderImageNote(cfg) {
    var el = $('imgNote');
    var hint = $('assetHint');
    var app = status && status.app;
    var res = status && status.images && status.images.large;
    var key = String(cfg.apps[host].largeImage || '').trim();
    var msg = '';
    if (app && app.ok) {
      hint.textContent = app.assets.length
        ? 'Art assets on “' + app.name + '”: ' + app.assets.join(', ')
        : '“' + app.name + '” has no Art Assets yet' + (app.iconUrl ? ' — type icon to use the app icon.' : '.');
    } else if (app && app.error) {
      hint.textContent = 'Couldn’t check your Discord app: ' + app.error;
    } else hint.textContent = '';
    if (key && res && res.missingKey && res.missingKey === key.toLowerCase()) {
      msg = 'No Art Asset called “' + res.missingKey + '” on your Discord app' +
        (res.source === 'icon' ? ', so your app icon is shown instead.' : ', and the app has no icon either, so no image is shown.') +
        ' Upload it under Rich Presence → Art Assets with that exact name, or change the name in Images & links.';
    }
    el.hidden = !msg;
    el.textContent = msg;
  }

  var lastVarsJson = '';
  function renderVars(vars) {
    var keys = VARS[host].concat(MEDIA_HOSTS[host] ? VARS.media : [], VARS.common);
    var json = JSON.stringify(keys.map(function (k) { return vars[k]; }));
    if (json === lastVarsJson) return;
    lastVarsJson = json;
    var list = $('varList');
    list.innerHTML = '';
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'var';
      b.type = 'button';
      var v = vars[k];
      var code = document.createElement('code');
      code.textContent = '{' + k + '}';
      var val = document.createElement('span');
      val.className = 'val';
      val.textContent = v === undefined || v === '' ? '—' : String(v);
      b.appendChild(code);
      b.appendChild(val);
      b.title = 'Insert {' + k + '}';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the field
      b.addEventListener('click', function () { insertVar(k); });
      list.appendChild(b);
    });
  }

  function insertVar(k) {
    var el = lastTemplateInput || document.querySelector('[data-key="app.details"]');
    var token = '{' + k + '}';
    var s = el.selectionStart != null ? el.selectionStart : el.value.length;
    var e = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    el.value = el.value.slice(0, s) + token + el.value.slice(e);
    el.focus();
    el.selectionStart = el.selectionEnd = s + token.length;
    el.dispatchEvent(new Event('input'));
  }

  // ---------- actions ----------
  function commandTo(h, cmd) {
    C.writeJSON(C.commandPath(h), { cmd: cmd, nonce: Date.now() + '-' + Math.random() });
  }
  function command(cmd) { commandTo(host, cmd); }

  $('btnReconnect').addEventListener('click', function () {
    if (!serviceAlive() && host === here) startService();
    command('reconnect');
    toast('Reconnecting…');
  });

  $('btnResetText').addEventListener('click', function () {
    var d = C.defaults().apps[host];
    var fresh = C.load();
    TEXT_KEYS.forEach(function (k) { if (d[k] !== undefined) fresh.apps[host][k] = d[k]; });
    C.save(fresh);
    settings = fresh;
    settingsMtime = C.mtime(C.settingsPath());
    fillFields();
    render();
    toast('Text reset to defaults');
  });

  function openPath(p, asText) {
    try {
      var cp = nodeRequire('child_process');
      var plat = (window.cep_node && window.cep_node.process || process).platform;
      if (plat === 'win32') cp.spawn(asText ? 'notepad.exe' : 'explorer.exe', [p], { detached: true });
      else cp.spawn('open', asText ? ['-t', p] : [p], { detached: true });
    } catch (e) { toast('Could not open: ' + e.message); }
  }
  $('openFolder').addEventListener('click', function (e) { e.preventDefault(); openPath(C.dataDir()); });
  $('openLog').addEventListener('click', function (e) { e.preventDefault(); openPath(C.logPath(host), true); });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-url]');
    if (!a) return;
    e.preventDefault();
    cs.openURLInDefaultBrowser(a.getAttribute('data-url'));
  });

  var tabs = document.querySelectorAll('.tab');
  for (var t = 0; t < tabs.length; t++) tabs[t].addEventListener('click', function () {
    var name = this.getAttribute('data-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i] === this);
    var panes = document.querySelectorAll('.pane');
    for (var j = 0; j < panes.length; j++) panes[j].hidden = panes[j].getAttribute('data-pane') !== name;
    if (name === 'time') renderTime();
  });

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }

  // ---------- init ----------
  // Point the whole panel at one app's settings + status.
  function applyHost(h) {
    host = h;
    lastVarsJson = '';
    lastTemplateInput = null;
    $('setupAppName').textContent = P.APP_LABEL[host];
    $('pvGlyph').innerHTML = GLYPH[host];
    $('workingTitle').textContent = host === 'AME' ? 'While the queue is idle' : 'While working';
    document.querySelector('[data-key="app.statusDisplay"] option[value="0"]').textContent =
      'App name (“Playing ' + P.APP_LABEL[host] + '”)';
    var only = document.querySelectorAll('[data-only]');
    for (var o = 0; o < only.length; o++) only[o].hidden = only[o].getAttribute('data-only').split(' ').indexOf(host) < 0;
    var not = document.querySelectorAll('[data-not]');
    for (var n = 0; n < not.length; n++) not[n].hidden = not[n].getAttribute('data-not').split(' ').indexOf(host) >= 0;
    var builtin = C.builtinId(host);
    $('ownIdLabel').textContent = builtin ? 'Your own Application ID (optional, replaces the built-in app)' : 'Application (Client) ID';
    var idInputs = document.querySelectorAll('[data-key="app.clientId"]');
    for (var q = 0; q < idInputs.length; q++) idInputs[q].placeholder = builtin ? 'built-in: ' + builtin : 'e.g. 1234567890123456789';
    fillFields();
    readStatus();
  }

  var sel = $('hostSelect');
  C.HOSTS.forEach(function (h) {
    var opt = document.createElement('option');
    opt.value = h;
    opt.textContent = P.APP_LABEL[h];
    if (h === here) opt.title = 'The app this panel is open in';
    sel.appendChild(opt);
  });
  sel.value = here;
  sel.addEventListener('change', function () { applyHost(sel.value); });

  bindFields();
  applyHost(here);
  if (!serviceAlive()) startService();
  setInterval(readStatus, 1000);
  setInterval(tickTime, 1000);
  setInterval(function () { if (!document.querySelector('.pane[data-pane="time"]').hidden) renderTime(); }, 15000);
})();
