// Injected into the panel page for screenshots: fakes Adobe's CEP bridge and Node's fs.
(function () {
  var cfg = window.__FAKE__ || {};
  var files = {};
  var now = Date.now();
  var sep = '\\';
  var appdata = 'C:\\Users\\happy\\AppData\\Roaming';
  var dir = appdata + sep + 'AdobeDiscordPresence';
  var host = cfg.host || 'PPRO';
  function put(name, obj) { files[dir + sep + name] = { data: JSON.stringify(obj), mtime: now }; }
  if (cfg.settings) put('settings.json', cfg.settings);
  if (cfg.files) Object.keys(cfg.files).forEach(function (n) { put(n, cfg.files[n]); });
  if (cfg.dist) {
    var d0;
    Object.defineProperty(window, 'DP_DIST', { configurable: true,
      get: function () { return d0; },
      set: function (v) { d0 = v; Object.keys(cfg.dist).forEach(function (k) { d0[k] = cfg.dist[k]; }); } });
  }
  if (cfg.status) put('status-' + host + '.json', Object.assign({ ts: now, projectStart: now - 5025000, sessionStart: now - 7200000 }, cfg.status));

  var fs = {
    readFileSync: function (p) { if (!files[p]) { var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files[p].data; },
    writeFileSync: function (p, d) { files[p] = { data: String(d), mtime: Date.now() }; },
    appendFileSync: function (p, d) { files[p] = { data: (files[p] ? files[p].data : '') + d, mtime: Date.now() }; },
    renameSync: function (a, b) { files[b] = files[a]; files[b].mtime = Date.now(); delete files[a]; },
    unlinkSync: function (p) { delete files[p]; },
    mkdirSync: function () {},
    statSync: function (p) { if (!files[p]) throw new Error('ENOENT'); return { mtimeMs: files[p].mtime, size: files[p].data.length }; }
  };
  var path = { join: function () { return Array.prototype.join.call(arguments, sep); } };
  var os = { homedir: function () { return 'C:\\Users\\happy'; } };
  var proc = { platform: 'win32', env: { APPDATA: appdata }, pid: 4242 };
  window.cep_node = {
    process: proc,
    require: function (m) {
      return { fs: fs, path: path, os: os, child_process: { spawn: function () {} } }[m];
    }
  };
  var bg = cfg.bg || { red: 35, green: 35, blue: 35 };
  window.__adobe_cep__ = {
    getHostEnvironment: function () {
      return JSON.stringify({ appName: cfg.appName || host, appVersion: cfg.appVersion || '25.1.0', appSkinInfo: { panelBackgroundColor: { color: bg } } });
    },
    evalScript: function (s, cb) { cb && cb(''); },
    addEventListener: function () {},
    dispatchEvent: function () {},
    getSystemPath: function () { return 'file:///C:/ext'; },
    requestOpenExtension: function () {},
    getOSInformation: function () { return 'Windows 10'; }
  };
  window.cep = { util: { openURLInDefaultBrowser: function () {} } };
  window.__files = files;
})();
