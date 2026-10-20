/*
 * Turns raw app info into template variables and a Discord activity.
 * Pure logic (no I/O) so it can be unit-tested and used by the panel preview.
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.Presence = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  var APP_LABEL = {
    PPRO: 'Premiere Pro', AEFT: 'After Effects', PHXS: 'Photoshop',
    ILST: 'Illustrator', AUDT: 'Audition', AME: 'Media Encoder'
  };

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function plural(n, one, many) {
    if (num(n) === null) return '';
    return n + ' ' + (n === 1 ? one : many);
  }

  function fmtTime(sec) {
    sec = num(sec);
    if (sec === null || sec < 0) return '';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function fmtFps(fps) {
    fps = num(fps);
    if (fps === null || fps <= 0) return '';
    return String(Number(fps.toFixed(3)));
  }

  function fmtFormat(w, h) {
    w = num(w); h = num(h);
    if (!w || !h) return '';
    var short = Math.min(w, h);
    var label =
      short >= 4320 ? '8K' :
      short >= 2160 ? '4K' :
      short >= 1440 ? '1440p' :
      short >= 1080 ? '1080p' :
      short >= 720 ? '720p' : short + 'p';
    if (w === h) return 'Square ' + label;
    if (h > w) return 'Vertical ' + label;
    return label;
  }

  // Marketing year from the version number, per app (Photoshop 26 = 2025, Illustrator 29 = 2025…).
  function versionParts(v, host) {
    var m = String(v || '').match(/^(\d+)(?:\.(\d+))?/);
    if (!m) return { short: '', year: '' };
    var major = parseInt(m[1], 10);
    var minor = m[2] ? parseInt(m[2], 10) : 0;
    var year = '';
    if (host === 'PHXS') { if (major >= 21) year = String(1999 + major); }
    else if (host === 'ILST') { if (major >= 24) year = String(1996 + major); }
    else if (major >= 22) year = String(2000 + major);
    else if (major === 15 || major === 18 || major === 14) year = '2021'; // PPro/AME 15, AE 18, Audition 14
    return { short: major + '.' + minor, year: year };
  }

  function fmtDur(sec) {
    sec = num(sec);
    if (sec === null) return '';
    var m = Math.floor(sec / 60);
    if (m < 1) return sec > 0 ? '<1m' : '0m';
    var h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + 'm' : m + 'm';
  }

  function normPath(p) { return '/' + String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').toLowerCase(); }

  /** Private if privacy mode is on, the project is marked private, or it's inside a private folder. */
  function isPrivate(info, settings) {
    if (!settings) return false;
    if (settings.privacy) return true;
    var p = info && info.path ? normPath(info.path) : '';
    if (!p) return false;
    var exact = settings.privateProjects || [];
    for (var i = 0; i < exact.length; i++) if (exact[i] && normPath(exact[i]) === p) return true;
    var rules = settings.privateFolders || [];
    for (var j = 0; j < rules.length; j++) {
      var r = String(rules[j] || '').trim();
      if (!r) continue;
      var nr = normPath(r).replace(/\/+$/, '');
      if (nr === '/') continue;
      // Full path ("D:\Work\Clients") → prefix match; bare name ("Clients") → any folder with that name.
      var isFull = /^([a-z]:|\/|\\\\|~)/i.test(r);
      if (isFull ? p.indexOf(nr + '/') === 0 : p.indexOf(nr + '/') >= 0) return true;
    }
    return false;
  }

  function count(vars, key, n, one, many) {
    if (num(n) === null) return;
    vars[key] = n;
    vars[key + 'Text'] = plural(n, one, many);
  }

  /** extra: { time: { today, project, week } (seconds), version } */
  function buildVars(host, info, settings, extra) {
    info = info || {};
    extra = extra || {};
    var privacy = isPrivate(info, settings);
    var label = (settings && settings.privacyLabel) || 'a secret project';
    var v = versionParts(extra.version || info.version, host);
    var vars = {
      app: APP_LABEL[host] || host,
      version: v.short,
      year: v.year || v.short,
      project: info.project ? (privacy ? label : info.project) : '',
      private: privacy ? 'yes' : ''
    };
    vars.document = vars.project;
    if (info.width && info.height) {
      vars.width = info.width;
      vars.height = info.height;
      vars.resolution = info.width + '×' + info.height;
      vars.format = fmtFormat(info.width, info.height);
    }
    vars.fps = fmtFps(info.fps);
    vars.duration = fmtTime(info.duration);
    vars.playhead = fmtTime(info.playhead);
    if (num(info.selected) !== null) {
      vars.selected = info.selected;
      vars.selectedText = info.selected ? info.selected + ' selected' : '';
    }
    if (extra.time) {
      vars.todayTime = extra.time.today ? fmtDur(extra.time.today) : '';
      vars.projectTime = extra.time.project ? fmtDur(extra.time.project) : '';
      vars.weekTime = extra.time.week ? fmtDur(extra.time.week) : '';
    }

    if (host === 'PPRO') {
      vars.sequence = info.sequence && !privacy ? info.sequence : '';
      count(vars, 'clips', info.clips, 'clip', 'clips');
      count(vars, 'audioClips', info.audioClips, 'audio clip', 'audio clips');
      count(vars, 'videoTracks', info.videoTracks, 'video track', 'video tracks');
      count(vars, 'audioTracks', info.audioTracks, 'audio track', 'audio tracks');
      count(vars, 'sequences', info.sequences, 'sequence', 'sequences');
      count(vars, 'items', info.items, 'bin item', 'bin items');
    } else if (host === 'AEFT') {
      vars.comp = info.comp && !privacy ? info.comp : '';
      vars.item = info.item && !privacy ? info.item : '';
      count(vars, 'layers', info.layers, 'layer', 'layers');
      count(vars, 'comps', info.comps, 'comp', 'comps');
      count(vars, 'items', info.items, 'item', 'items');
      if (num(info.queued) !== null) { vars.queued = info.queued; vars.queuedText = info.queued ? plural(info.queued, 'item', 'items') : ''; }
      vars.rendering = info.renderComp ? (privacy ? 'a comp' : info.renderComp) : '';
    } else if (host === 'PHXS') {
      count(vars, 'layers', info.layers, 'layer', 'layers');
      count(vars, 'docs', info.docs, 'document', 'documents');
      vars.tool = info.tool || '';
      vars.colorMode = info.colorMode || '';
      vars.dpi = info.dpi ? info.dpi + ' ppi' : '';
      count(vars, 'history', info.history, 'history step', 'history steps');
      vars.unsaved = info.saved === false ? 'Unsaved changes' : '';
    } else if (host === 'ILST') {
      count(vars, 'layers', info.layers, 'layer', 'layers');
      count(vars, 'docs', info.docs, 'document', 'documents');
      count(vars, 'artboards', info.artboards, 'artboard', 'artboards');
      count(vars, 'objects', info.objects, 'object', 'objects');
      vars.artboard = info.artboard && !privacy ? info.artboard : '';
      vars.colorMode = info.colorMode || '';
      vars.unsaved = info.saved === false ? 'Unsaved changes' : '';
    } else if (host === 'AUDT') {
      vars.docType = info.docType || '';
      vars.sampleRate = info.sampleRateHz ? Number((info.sampleRateHz / 1000).toFixed(1)) + ' kHz' : '';
      count(vars, 'tracks', info.tracks, 'track', 'tracks');
    } else if (host === 'AME') {
      vars.project = '';
      vars.document = '';
      vars.file = info.file ? (privacy || settings.privacy ? 'a file' : info.file) : '';
      vars.output = info.output && !(privacy || settings.privacy) ? info.output : '';
      var pct = num(info.progress) !== null && info.rendering ? Math.floor(info.progress * 100) : null;
      vars.progress = pct !== null ? pct : '';
      vars.progressText = pct !== null ? (pct - pct % 5) + '%' : '';
      if (extra.timeLeft) vars.timeLeft = fmtTime(extra.timeLeft);
      vars.done = info.done || 0;
      vars.doneText = info.done ? plural(info.done, 'export', 'exports') + ' done' : '';
      vars.failedText = info.failed ? info.failed + ' failed' : '';
    }
    return vars;
  }

  /**
   * Fill {placeholders}. Parts separated by " · ", " • " or " | " are dropped
   * when any placeholder inside them is empty, so lines never show dangling bits.
   */
  function render(tpl, vars) {
    if (!tpl) return '';
    var pieces = String(tpl).split(/(\s+[·•|]\s+)/);
    var kept = [];
    for (var i = 0; i < pieces.length; i += 2) {
      var sep = i > 0 ? pieces[i - 1] : '';
      var missing = false;
      var text = pieces[i].replace(/\{(\w+)\}/g, function (m, k) {
        var val = vars[k];
        if (val === undefined || val === null || val === '') { missing = true; return ''; }
        return String(val);
      });
      if (!missing && text.replace(/\s+/g, '')) kept.push({ text: text, sep: sep });
    }
    var out = '';
    for (var j = 0; j < kept.length; j++) out += (j ? kept[j].sep || ' · ' : '') + kept[j].text;
    return out.replace(/\s+/g, ' ').trim();
  }

  // Discord needs 2–128 characters per text field.
  function fit(text, max) {
    max = max || 128;
    if (!text) return undefined;
    var chars = Array.from ? Array.from(text) : text.split('');
    if (chars.length > max) text = chars.slice(0, max - 1).join('') + '…';
    if (text.length < 2) text += '​';
    return text;
  }

  function validUrl(u) { return /^https?:\/\/\S+$/i.test(String(u || '').trim()); }

  function decideMode(info, appCfg, settings, idle, playing) {
    if (!settings.enabled || !appCfg.enabled) return 'paused';
    if (!info || !info.hasProject) return 'noProject';
    if (info.rendering) return 'rendering';
    if (info.host === 'AME' && appCfg.onlyWhileEncoding) return 'hidden';
    if (playing && appCfg.autoWatch) return 'watching';
    if (idle) return 'idle';
    return 'active';
  }

  // extra.progress = { start, end } (ms) while watching, for Discord's progress bar.
  function buildActivity(host, mode, vars, settings, startTimestamp, extra) {
    extra = extra || {};
    var a = settings.apps[host];
    if (mode === 'paused' || mode === 'hidden') return null;
    if (mode === 'idle' && settings.idleAction === 'clear') return null;

    var details, state, small = a.smallImage, smallText = render(a.smallText, vars);
    if (mode === 'noProject') { details = a.noProjectDetails; state = a.noProjectState; }
    else if (mode === 'idle') {
      details = a.idleDetails; state = a.idleState;
      if (a.idleSmallImage) { small = a.idleSmallImage; smallText = 'Idle'; }
    } else if (mode === 'watching') {
      details = a.watchDetails || a.details; state = a.watchState || a.state;
      if (a.watchSmallImage) { small = a.watchSmallImage; smallText = 'Playing back'; }
    } else if (mode === 'rendering') {
      details = a.renderDetails || a.details; state = a.renderState || a.state;
      if (a.renderSmallImage) { small = a.renderSmallImage; smallText = 'Rendering'; }
    } else { details = a.details; state = a.state; }

    var activity = {};
    var d = fit(render(details, vars));
    var s = fit(render(state, vars));
    if (d) activity.details = d;
    if (s) activity.state = s;

    if (mode === 'watching' && a.watchProgress && extra.progress) {
      activity.timestamps = { start: extra.progress.start, end: extra.progress.end };
    } else if (mode === 'rendering' && a.renderCountdown && extra.countdown) {
      activity.timestamps = { start: extra.countdown.start, end: extra.countdown.end };
    } else if (settings.elapsed !== 'off' && startTimestamp) {
      activity.timestamps = { start: startTimestamp };
    }

    var assets = {};
    if (a.largeImage) {
      assets.large_image = String(a.largeImage).trim();
      var lt = fit(render(a.largeText, vars));
      if (lt) assets.large_text = lt;
    }
    if (small) {
      assets.small_image = String(small).trim();
      var st = fit(smallText);
      if (st) assets.small_text = st;
    }
    if (assets.large_image || assets.small_image) activity.assets = assets;

    var buttons = [];
    var list = settings.buttons || [];
    for (var i = 0; i < list.length && buttons.length < 2; i++) {
      var b = list[i] || {};
      var label = render(b.label, vars);
      if (label && validUrl(b.url)) buttons.push({ label: fit(label, 32), url: String(b.url).trim().slice(0, 512) });
    }
    if (buttons.length) activity.buttons = buttons;

    var type = parseInt(mode === 'watching' ? a.watchType : a.activityType, 10) || 0;
    if (type) activity.type = type;
    var sd = parseInt(a.statusDisplay, 10) || 0;
    if (sd) activity.status_display_type = sd;
    activity.instance = false;
    return activity;
  }

  // What counts as "you did something" for idle detection.
  function fingerprint(info) {
    if (!info) return '';
    var keys = ['project', 'sequence', 'comp', 'item', 'playhead', 'clips', 'audioClips', 'layers',
      'selected', 'duration', 'items', 'sequences', 'comps', 'rendering', 'queued', 'history', 'historyState',
      'tool', 'docs', 'artboardIndex', 'objects', 'saved', 'tracks', 'progress', 'done'];
    var out = [];
    for (var i = 0; i < keys.length; i++) out.push(info[keys[i]]);
    return JSON.stringify(out);
  }

  /*
   * Detects timeline playback from playhead samples (~1/s). "Moving" = the playhead
   * advances at 0.25x–8x real time (covers J/K/L shuttling, ignores clicks and jumps).
   */
  function PlaybackTracker() { this.reset(); }
  PlaybackTracker.prototype.reset = function () {
    this.last = null; this.movingSince = 0; this.lastMoveAt = 0; this.rate = 0;
  };
  PlaybackTracker.prototype.feed = function (key, pos, now) {
    var l = this.last;
    if (pos === null || pos === undefined || !isFinite(pos)) { this.reset(); return; }
    if (l && now - l.now < 300) return;
    this.last = { key: key, pos: pos, now: now };
    if (!l || l.key !== key || now - l.now > 6000) { this.movingSince = 0; return; }
    var rate = (pos - l.pos) / ((now - l.now) / 1000);
    var speed = Math.abs(rate);
    if (speed >= 0.25 && speed <= 8) {
      if (!this.movingSince) this.movingSince = l.now;
      this.lastMoveAt = now;
      this.rate = rate;
    } else if (now - this.lastMoveAt > 1500) {
      this.movingSince = 0;
      this.rate = 0;
    }
  };
  /** Seconds of continuous playback so far (0 when stopped). */
  PlaybackTracker.prototype.playingFor = function (now) {
    if (!this.movingSince || now - this.lastMoveAt > 2500) return 0;
    return (now - this.movingSince) / 1000;
  };

  return {
    APP_LABEL: APP_LABEL,
    PlaybackTracker: PlaybackTracker,
    isPrivate: isPrivate,
    fmtDur: fmtDur,
    buildVars: buildVars,
    render: render,
    fit: fit,
    decideMode: decideMode,
    buildActivity: buildActivity,
    fingerprint: fingerprint,
    fmtTime: fmtTime,
    fmtFps: fmtFps,
    fmtFormat: fmtFormat,
    versionParts: versionParts
  };
});
