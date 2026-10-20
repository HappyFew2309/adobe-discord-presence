/*
 * Settings + shared files. Everything lives in one folder so the panel and the
 * background service (and every Adobe app) see the same settings:
 *   Windows: %APPDATA%\AdobeDiscordPresence\
 *   macOS:   ~/Library/Application Support/AdobeDiscordPresence/
 */
(function (root, factory) {
  var nodeRequire =
    (root && root.cep_node && root.cep_node.require) ||
    (typeof require === 'function' ? require : null);
  var nodeProcess =
    (root && root.cep_node && root.cep_node.process) ||
    (typeof process !== 'undefined' ? process : null);
  var api = factory(nodeRequire, nodeProcess);
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.Config = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function (nodeRequire, nodeProcess) {
  var fs = nodeRequire('fs');
  var path = nodeRequire('path');
  var os = nodeRequire('os');

  var HOSTS = ['PPRO', 'AEFT', 'PHXS', 'ILST', 'AUDT', 'AME'];
  var APP_LABEL = {
    PPRO: 'Premiere Pro', AEFT: 'After Effects', PHXS: 'Photoshop',
    ILST: 'Illustrator', AUDT: 'Audition', AME: 'Media Encoder'
  };

  // Photoshop reports itself as PHXS or PHSP depending on version.
  function normalizeHost(h) { return h === 'PHSP' ? 'PHXS' : h; }

  function appDefaults(label, o) {
    var base = {
      enabled: true,
      clientId: '',
      activityType: 0, // 0 Playing, 3 Watching, 2 Listening, 5 Competing
      statusDisplay: 0, // member list shows: 0 app name, 2 details line, 1 state line
      details: 'Working on {project}',
      state: '',
      largeImage: 'logo',
      largeText: label + ' {year}',
      smallImage: '',
      smallText: '',
      idleDetails: 'Idle in {project}',
      idleState: 'Away from the keyboard',
      idleSmallImage: '',
      noProjectDetails: 'On the home screen',
      noProjectState: ''
    };
    for (var k in o) if (o.hasOwnProperty(k)) base[k] = o[k];
    return base;
  }

  function defaults() {
    return {
      version: 2,
      enabled: true,
      pollSeconds: 5,
      privacy: false,
      privacyLabel: 'a secret project',
      privateFolders: [], // projects saved inside these folders are always private
      privateProjects: [], // exact project paths marked private from the panel
      elapsed: 'project', // 'project' | 'session' | 'off'
      idleMinutes: 10,
      idleAction: 'show', // 'show' | 'clear'
      trackTime: true,
      updates: { check: true, auto: true },
      buttons: [
        { label: '', url: '' },
        { label: '', url: '' }
      ],
      apps: {
        PPRO: appDefaults('Premiere Pro', {
          details: 'Editing {project}',
          state: '{sequence} · {format} · {fps} fps',
          largeText: 'Premiere Pro {year} · {clipsText} · {sequencesText}',
          idleState: 'Away from the timeline',
          autoWatch: true, // switch activity type while the timeline plays
          watchAfterSeconds: 10,
          watchType: 3, // Watching
          watchDetails: 'Reviewing {project}',
          watchState: 'Playing back {sequence}',
          watchProgress: true, // progress bar = playhead position in the sequence
          watchSmallImage: ''
        }),
        AEFT: appDefaults('After Effects', {
          details: 'Animating {project}',
          state: '{comp} · {layersText} · {format}',
          largeText: 'After Effects {year} · {compsText}',
          idleState: 'Away from the timeline',
          renderDetails: 'Rendering {project}',
          renderState: '{rendering} · {queuedText} in queue',
          renderSmallImage: ''
        }),
        PHXS: appDefaults('Photoshop', {
          details: 'Editing {document}',
          state: '{resolution} · {layersText}',
          largeText: 'Photoshop {year} · {docsText} open',
          smallText: '{tool}',
          idleState: 'Away from the canvas'
        }),
        ILST: appDefaults('Illustrator', {
          details: 'Designing {document}',
          state: '{artboard} · {artboardsText} · {layersText}',
          largeText: 'Illustrator {year} · {docsText} open',
          idleState: 'Away from the artboard'
        }),
        AUDT: appDefaults('Audition', {
          details: 'Mixing {document}',
          state: '{docType} · {sampleRate}',
          largeText: 'Audition {year}',
          idleState: 'Away from the mixer'
        }),
        AME: appDefaults('Media Encoder', {
          onlyWhileEncoding: true, // hide your status while the queue is idle
          details: 'Queue idle',
          state: '{doneText}',
          largeText: 'Media Encoder {year}',
          noProjectDetails: 'Queue idle',
          renderDetails: 'Encoding {file}',
          renderState: '{progressText} · {doneText}',
          renderSmallImage: '',
          renderCountdown: true // show "x:xx left" based on encode progress
        })
      }
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !(v instanceof Array); }

  // Fill missing keys from defaults, keep the user's values.
  function merge(base, over) {
    if (!isObj(base)) return over === undefined ? base : over;
    var out = {};
    var k;
    for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    if (!isObj(over)) return out;
    for (k in over) {
      if (!over.hasOwnProperty(k)) continue;
      if (isObj(base[k]) && isObj(over[k])) out[k] = merge(base[k], over[k]);
      else if (over[k] !== undefined) out[k] = over[k];
    }
    return out;
  }

  function dataDir() {
    var env = nodeProcess.env || {};
    var base;
    if (nodeProcess.platform === 'win32') base = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    else if (nodeProcess.platform === 'darwin') base = path.join(os.homedir(), 'Library', 'Application Support');
    else base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    if (env.ADP_DATA_DIR) return env.ADP_DATA_DIR; // tests
    return path.join(base, 'AdobeDiscordPresence');
  }

  function ensureDir() {
    var d = dataDir();
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  function file(name) { return path.join(ensureDir(), name); }

  function readJSON(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
  }

  // Write to a temp file first so readers never see half a file.
  function writeJSON(p, obj) {
    var tmp = p + '.' + nodeProcess.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    try { fs.renameSync(tmp, p); } catch (e) {
      fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
      try { fs.unlinkSync(tmp); } catch (e2) {}
    }
  }

  function settingsPath() { return file('settings.json'); }

  function load() {
    var p = settingsPath();
    var user = readJSON(p, null);
    var s = merge(defaults(), user || {});
    if (!user) { try { writeJSON(p, s); } catch (e) {} }
    return s;
  }

  function save(s) { writeJSON(settingsPath(), s); }

  function mtime(p) {
    try { return fs.statSync(p).mtimeMs; } catch (e) { return 0; }
  }

  function timePath(host) { return file('time-' + host + '.json'); }
  function statusPath(host) { return file('status-' + host + '.json'); }
  function commandPath(host) { return file('command-' + host + '.json'); }
  function logPath(host) { return file('log-' + host + '.txt'); }

  function log(host, msg) {
    try {
      var p = logPath(host);
      var line = new Date().toISOString() + '  ' + msg + '\n';
      var size = 0;
      try { size = fs.statSync(p).size; } catch (e) {}
      if (size > 256 * 1024) fs.writeFileSync(p, line, 'utf8');
      else fs.appendFileSync(p, line, 'utf8');
    } catch (e) {}
  }

  function dist() {
    var d = (typeof window !== 'undefined' && window.DP_DIST) || null;
    if (!d) { try { d = nodeRequire(path.join(__dirname, 'distribution.js')); } catch (e) { d = {}; } }
    return d || {};
  }

  // Built-in app (shared/distribution.js) unless the user entered their own ID.
  function builtinId(host) {
    var ids = dist().appIds || {};
    return String(ids[host] || '').trim();
  }

  function clientId(settings, host) {
    var own = String((settings.apps[host] && settings.apps[host].clientId) || '').trim();
    return own || builtinId(host);
  }

  return {
    HOSTS: HOSTS,
    APP_LABEL: APP_LABEL,
    normalizeHost: normalizeHost,
    dist: dist,
    builtinId: builtinId,
    clientId: clientId,
    defaults: defaults,
    merge: merge,
    dataDir: dataDir,
    load: load,
    save: save,
    file: file,
    settingsPath: settingsPath,
    statusPath: statusPath,
    timePath: timePath,
    commandPath: commandPath,
    logPath: logPath,
    readJSON: readJSON,
    writeJSON: writeJSON,
    mtime: mtime,
    log: log
  };
});
