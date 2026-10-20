/*
 * Auto-updater. Checks your GitHub repo's latest release, downloads the signed .zxp,
 * verifies its SHA-256 against checksums.txt from the same release, unpacks it next to
 * the installed extension and swaps the folders. The new version loads on next app start.
 */
(function (root, factory) {
  var nodeRequire =
    (root && root.cep_node && root.cep_node.require) ||
    (typeof require === 'function' ? require : null);
  var api = factory(nodeRequire);
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.Updater = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function (nodeRequire) {
  var fs = nodeRequire('fs');
  var path = nodeRequire('path');
  var crypto = nodeRequire('crypto');
  var BUNDLE_ID = 'com.happyfew.discordpresence';

  function compare(a, b) {
    var x = String(a || '0').replace(/^v/i, '').split(/[.+-]/), y = String(b || '0').replace(/^v/i, '').split(/[.+-]/);
    for (var i = 0; i < 3; i++) {
      var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
      if (p !== q) return p > q ? 1 : -1;
    }
    return 0;
  }

  function manifestInfo(dir) {
    try {
      var xml = fs.readFileSync(path.join(dir, 'CSXS', 'manifest.xml'), 'utf8');
      var v = xml.match(/ExtensionBundleVersion="([^"]+)"/);
      var id = xml.match(/ExtensionBundleId="([^"]+)"/);
      return { version: v ? v[1] : '', id: id ? id[1] : '' };
    } catch (e) { return { version: '', id: '' }; }
  }

  // GET with redirects (GitHub asset downloads redirect to a CDN). cb(err, Buffer)
  function httpGet(url, cb, redirects) {
    redirects = redirects || 0;
    var https = nodeRequire('https');
    var done = false;
    var finish = function (err, b) { if (!done) { done = true; cb(err, b); } };
    var req = https.get(url, {
      headers: { 'User-Agent': 'AdobeDiscordPresence-Updater', Accept: /api\.github\.com/.test(url) ? 'application/vnd.github+json' : 'application/octet-stream' },
      timeout: 20000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 5) return finish(new Error('Too many redirects'));
        return httpGet(res.headers.location, finish, redirects + 1);
      }
      if (res.statusCode !== 200) { res.resume(); return finish(new Error('HTTP ' + res.statusCode + ' for ' + url.replace(/\?.*$/, ''))); }
      var chunks = [];
      res.on('data', function (c) { chunks.push(typeof c === 'string' ? Buffer.from(c) : c); });
      res.on('end', function () { finish(null, Buffer.concat(chunks)); });
    });
    req.on('timeout', function () { req.destroy(new Error('Timed out')); });
    req.on('error', function (e) { finish(e); });
  }

  function rmrf(p) {
    try { (fs.rmSync || fs.rmdirSync).call(fs, p, { recursive: true, force: true }); } catch (e) {}
  }

  function listFiles(dir, base, out) {
    out = out || [];
    base = base || '';
    var items = fs.readdirSync(dir);
    for (var i = 0; i < items.length; i++) {
      var rel = base ? base + '/' + items[i] : items[i];
      var full = path.join(dir, items[i]);
      if (fs.statSync(full).isDirectory()) listFiles(full, rel, out); else out.push(rel);
    }
    return out;
  }

  // Used when the installed folder can't be renamed (e.g. a file is locked): overwrite in place.
  function copyOver(src, dest) {
    var files = listFiles(src);
    var keep = {};
    for (var i = 0; i < files.length; i++) {
      keep[files[i]] = true;
      var t = path.join(dest, files[i]);
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.writeFileSync(t, fs.readFileSync(path.join(src, files[i])));
    }
    var existing = listFiles(dest);
    for (var j = 0; j < existing.length; j++) {
      if (!keep[existing[j]]) { try { fs.unlinkSync(path.join(dest, existing[j])); } catch (e) {} }
    }
  }

  /**
   * opts: { repo: 'owner/repo', extDir, dataDir, log(msg), get(url, cb) (optional, for tests), zip }
   */
  function Updater(opts) {
    this.repo = String(opts.repo || '').trim();
    this.extDir = opts.extDir;
    this.dataDir = opts.dataDir;
    this.log = opts.log || function () {};
    this.get = opts.get || httpGet;
    this.zip = opts.zip;
    this.running = manifestInfo(this.extDir).version; // version loaded right now
    this.state = { state: 'idle', running: this.running };
  }

  Updater.prototype.enabled = function () { return /^[\w.-]+\/[\w.-]+$/.test(this.repo); };

  Updater.prototype._set = function (patch) {
    for (var k in patch) if (patch.hasOwnProperty(k)) this.state[k] = patch[k];
    this.state.installed = manifestInfo(this.extDir).version; // what's on disk (may be newer after an update)
    this.state.running = this.running;
    this.state.restartNeeded = compare(this.state.installed, this.running) > 0;
  };

  Updater.prototype.check = function (cb) {
    var self = this;
    if (!this.enabled()) return cb && cb(new Error('No GitHub repo configured'));
    this._set({ state: 'checking', error: '' });
    this.get('https://api.github.com/repos/' + this.repo + '/releases/latest', function (err, body) {
      var rel = null;
      if (!err) { try { rel = JSON.parse(body.toString('utf8')); } catch (e) { err = e; } }
      if (err || !rel || !rel.tag_name) {
        var msg = err ? err.message : 'No releases found';
        if (/HTTP 404/.test(msg)) msg = 'No published release yet';
        self._set({ state: 'error', error: msg, checkedAt: Date.now() });
        return cb && cb(new Error(msg));
      }
      var zxp = null, sums = null;
      (rel.assets || []).forEach(function (a) {
        if (/\.zxp$/i.test(a.name)) zxp = a;
        if (/^checksums\.txt$|\.sha256$/i.test(a.name)) sums = a;
      });
      var latest = String(rel.tag_name).replace(/^v/i, '');
      var info = {
        state: 'idle', error: '', checkedAt: Date.now(), latest: latest,
        available: compare(latest, manifestInfo(self.extDir).version) > 0 && !!zxp,
        notes: String(rel.body || '').slice(0, 2000), url: rel.html_url || '',
        zxpUrl: zxp ? zxp.browser_download_url : '', zxpName: zxp ? zxp.name : '',
        sumsUrl: sums ? sums.browser_download_url : ''
      };
      self._set(info);
      cb && cb(null, self.state);
    });
  };

  Updater.prototype._lock = function () {
    var p = path.join(this.dataDir, 'update.lock');
    try {
      var st = fs.statSync(p);
      if (Date.now() - st.mtimeMs < 10 * 60000) return null;
      fs.unlinkSync(p);
    } catch (e) {}
    try { fs.writeFileSync(p, String(Date.now()), { flag: 'wx' }); return p; } catch (e) { return null; }
  };

  Updater.prototype.install = function (cb) {
    var self = this;
    var s = this.state;
    var fail = function (msg) {
      self._set({ state: 'error', error: msg });
      if (lock) { try { fs.unlinkSync(lock); } catch (e) {} }
      self.log('Update failed: ' + msg);
      cb && cb(new Error(msg));
    };
    if (!s.available || !s.zxpUrl) return cb && cb(new Error('No update available'));
    if (!s.sumsUrl) return fail('Release has no checksums.txt — refusing to install');
    var lock = this._lock();
    if (!lock) return cb && cb(new Error('Another app is already updating'));
    var parent = path.dirname(this.extDir);
    var staged = path.join(parent, path.basename(this.extDir) + '.new-' + s.latest);
    try { rmrf(staged); fs.mkdirSync(staged, { recursive: true }); } catch (e) {
      return fail('Can’t write to ' + parent + '. Download the installer from the release page instead.');
    }
    this._set({ state: 'downloading', error: '' });
    this.log('Downloading ' + s.zxpName + ' (' + s.latest + ')');
    this.get(s.sumsUrl, function (err, sumsBuf) {
      if (err) { rmrf(staged); return fail('Checksum download failed: ' + err.message); }
      var expected = '';
      sumsBuf.toString('utf8').split(/\r?\n/).forEach(function (line) {
        var m = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
        if (m && m[2].trim() === s.zxpName) expected = m[1].toLowerCase();
      });
      if (!expected) { rmrf(staged); return fail('checksums.txt has no entry for ' + s.zxpName); }
      self.get(s.zxpUrl, function (err2, zxp) {
        if (err2) { rmrf(staged); return fail('Download failed: ' + err2.message); }
        var actual = crypto.createHash('sha256').update(zxp).digest('hex');
        if (actual !== expected) { rmrf(staged); return fail('Checksum mismatch — the download was corrupted or tampered with'); }
        self._set({ state: 'installing' });
        try {
          self.zip.extract(zxp, staged);
          var m = manifestInfo(staged);
          if (m.id !== BUNDLE_ID) throw new Error('Package is not this extension (' + m.id + ')');
          if (compare(m.version, s.latest) !== 0) throw new Error('Package version ' + m.version + ' ≠ release ' + s.latest);
          if (!fs.existsSync(path.join(staged, 'META-INF', 'signatures.xml'))) throw new Error('Package is not signed');
          self._swap(staged);
        } catch (e) {
          rmrf(staged);
          return fail(e.message);
        }
        try { fs.unlinkSync(lock); } catch (e) {}
        self.log('Installed ' + s.latest + ' — restart the app to load it');
        self._set({ state: 'idle', available: false });
        cb && cb(null, self.state);
      });
    });
  };

  Updater.prototype._swap = function (staged) {
    var ext = this.extDir;
    var old = ext + '.old-' + Date.now();
    var moved = false;
    try { fs.renameSync(ext, old); moved = true; } catch (e) { this.log('Rename failed (' + e.code + '), copying over instead'); }
    if (moved) {
      try { fs.renameSync(staged, ext); } catch (e) {
        try { fs.renameSync(old, ext); } catch (e2) {}
        throw new Error('Could not move the new version into place: ' + e.message);
      }
      rmrf(old);
    } else {
      copyOver(staged, ext);
      rmrf(staged);
    }
  };

  /** Remove leftovers (.old-*, .new-*) from earlier updates. */
  Updater.prototype.cleanup = function () {
    try {
      var parent = path.dirname(this.extDir), base = path.basename(this.extDir);
      fs.readdirSync(parent).forEach(function (n) {
        if (n.indexOf(base + '.old-') === 0 || n.indexOf(base + '.new-') === 0) rmrf(path.join(parent, n));
      });
    } catch (e) {}
  };

  return { Updater: Updater, compare: compare, manifestInfo: manifestInfo, httpGet: httpGet };
});
