/*
 * Looks up public info about a Discord application (name, icon, art assets) so we can
 *  - check that the image you typed actually exists as an Art Asset,
 *  - fall back to the app icon when it doesn't,
 *  - show the real name + image in the panel preview.
 * Uses Discord's public, unauthenticated endpoints. Results are cached for 30 minutes.
 */
(function (root, factory) {
  var nodeRequire =
    (root && root.cep_node && root.cep_node.require) ||
    (typeof require === 'function' ? require : null);
  var api = factory(nodeRequire);
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.DiscordApp = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function (nodeRequire) {
  var TTL = 30 * 60 * 1000;
  var API = 'https://discord.com/api/v10';
  var CDN = 'https://cdn.discordapp.com';

  function getJSON(url, cb) {
    var https;
    try { https = nodeRequire('https'); } catch (e) { return cb(e); }
    var done = false;
    var finish = function (err, data) { if (!done) { done = true; cb(err, data); } };
    var req = https.get(url, { headers: { 'User-Agent': 'AdobeDiscordPresence/1.1' }, timeout: 8000 }, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        if (res.statusCode !== 200) return finish(new Error('HTTP ' + res.statusCode));
        try { finish(null, JSON.parse(body)); } catch (e) { finish(e); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', function (e) { finish(e); });
  }

  function iconUrl(id, hash) {
    return hash ? CDN + '/app-icons/' + id + '/' + hash + '.png?size=512' : '';
  }
  function assetUrl(id, assetId) {
    return CDN + '/app-assets/' + id + '/' + assetId + '.png';
  }

  /**
   * fetchInfo(clientId, cache, cb) — cache is a plain object you keep around (or load
   * from disk). cb(info) where info = { id, name, icon, iconUrl, assets:[{id,name}], ok, error, ts }
   */
  function fetchInfo(clientId, cache, force, cb) {
    var hit = cache && cache[clientId];
    if (hit && !force && Date.now() - hit.ts < TTL) return cb(hit);
    var info = { id: clientId, ts: Date.now(), ok: false, assets: hit ? hit.assets : [], name: hit ? hit.name : '', iconUrl: hit ? hit.iconUrl : '' };
    getJSON(API + '/applications/' + clientId + '/rpc', function (err, app) {
      if (err || !app || !app.id) {
        info.error = err ? String(err.message || err) : 'Unknown application';
        if (/HTTP 404/.test(info.error)) info.error = 'No Discord application with this ID';
        if (cache) cache[clientId] = info;
        return cb(info);
      }
      info.name = app.name || '';
      info.icon = app.icon || '';
      info.iconUrl = iconUrl(clientId, app.icon);
      getJSON(API + '/oauth2/applications/' + clientId + '/assets', function (err2, assets) {
        info.ok = true;
        if (!err2 && assets && assets.length !== undefined) {
          info.assets = [];
          for (var i = 0; i < assets.length; i++) info.assets.push({ id: String(assets[i].id), name: String(assets[i].name) });
        } else if (err2) {
          info.assetsError = String(err2.message || err2);
        }
        if (cache) cache[clientId] = info;
        cb(info);
      });
    });
  }

  function isUrl(s) { return /^https?:\/\//i.test(String(s || '').trim()); }

  /**
   * Decide what to send for an image field.
   * Returns { value, source: 'url'|'asset'|'icon'|'missing'|'unchecked'|'none', previewUrl }
   *  - "icon" (or "auto") always means the app icon.
   *  - an asset name that doesn't exist falls back to the app icon when fallback=true.
   */
  function resolveImage(key, info, fallback) {
    key = String(key || '').trim();
    if (!key) return { value: '', source: 'none' };
    if (isUrl(key)) return { value: key, source: 'url', previewUrl: key };
    var lower = key.toLowerCase();
    var haveIcon = info && info.iconUrl;
    if (lower === 'icon' || lower === 'auto') {
      return haveIcon ? { value: info.iconUrl, source: 'icon', previewUrl: info.iconUrl } : { value: '', source: 'missing' };
    }
    if (!info || !info.ok || info.assetsError) return { value: lower, source: 'unchecked' };
    for (var i = 0; i < info.assets.length; i++) {
      if (info.assets[i].name.toLowerCase() === lower) {
        return { value: lower, source: 'asset', previewUrl: assetUrl(info.id, info.assets[i].id) };
      }
    }
    if (fallback && haveIcon) return { value: info.iconUrl, source: 'icon', previewUrl: info.iconUrl, missingKey: lower };
    return { value: '', source: 'missing', missingKey: lower };
  }

  return { fetchInfo: fetchInfo, resolveImage: resolveImage, iconUrl: iconUrl, assetUrl: assetUrl, TTL: TTL };
});
