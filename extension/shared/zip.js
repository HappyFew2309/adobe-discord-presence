/*
 * Tiny ZIP extractor (stored + deflate), enough for .zxp packages. Node only.
 * Refuses absolute paths and "..", so a package can't write outside its folder.
 */
(function (root, factory) {
  var nodeRequire =
    (root && root.cep_node && root.cep_node.require) ||
    (typeof require === 'function' ? require : null);
  var api = factory(nodeRequire);
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.Zip = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function (nodeRequire) {
  var fs = nodeRequire('fs');
  var path = nodeRequire('path');
  var zlib = nodeRequire('zlib');

  function entries(buf) {
    var eocd = -1;
    for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    var count = buf.readUInt16LE(eocd + 10);
    var off = buf.readUInt32LE(eocd + 16);
    var list = [];
    for (var n = 0; n < count; n++) {
      if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Corrupt zip directory');
      var method = buf.readUInt16LE(off + 10);
      var csize = buf.readUInt32LE(off + 20);
      var usize = buf.readUInt32LE(off + 24);
      var nlen = buf.readUInt16LE(off + 28);
      var xlen = buf.readUInt16LE(off + 30);
      var clen = buf.readUInt16LE(off + 32);
      var local = buf.readUInt32LE(off + 42);
      var name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
      list.push({ name: name, method: method, csize: csize, usize: usize, local: local });
      off += 46 + nlen + xlen + clen;
    }
    return list;
  }

  function data(buf, e) {
    if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error('Corrupt zip entry ' + e.name);
    var start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    var raw = buf.slice(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new Error('Unsupported zip compression in ' + e.name);
  }

  function safeName(name) {
    var n = name.replace(/\\/g, '/');
    if (!n || n.charAt(0) === '/' || /^[a-z]:/i.test(n)) return null;
    var parts = n.split('/');
    for (var i = 0; i < parts.length; i++) if (parts[i] === '..') return null;
    return n;
  }

  /** Extract a zip Buffer into dest. Returns the list of extracted file paths (relative). */
  function extract(buf, dest) {
    var list = entries(buf);
    var out = [];
    fs.mkdirSync(dest, { recursive: true });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var n = safeName(e.name);
      if (n === null) throw new Error('Unsafe path in package: ' + e.name);
      var target = path.join(dest, n);
      if (/\/$/.test(n)) { fs.mkdirSync(target, { recursive: true }); continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      var content = data(buf, e);
      if (content.length !== e.usize) throw new Error('Size mismatch in ' + e.name);
      fs.writeFileSync(target, content);
      out.push(n);
    }
    return out;
  }

  return { extract: extract, entries: entries };
});
