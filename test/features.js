// Tests for: new apps, private folders, time tracking, zip, auto-updater.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ext = path.join(__dirname, '..', 'extension');
const P = require(path.join(ext, 'shared', 'presence.js'));
const C = require(path.join(ext, 'shared', 'config.js'));
const TT = require(path.join(ext, 'shared', 'timetrack.js'));
const Zip = require(path.join(ext, 'shared', 'zip.js'));
const U = require(path.join(ext, 'shared', 'updater.js'));
const hosts = require('./mock-hosts');
let passed = 0;
const ok = (n) => { passed++; console.log('  ✓ ' + n); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adp-f-'));

function line(host, info, mut, extra) {
  const s = C.defaults(); if (mut) mut(s);
  const v = P.buildVars(host, info, s, extra);
  const a = s.apps[host];
  return [P.render(a.details, v), P.render(a.state, v), P.render(a.largeText, v)];
}

(async () => {
  console.log('New apps');
  const ps = JSON.parse(hosts.load('PHXS', {}).getInfo());
  assert.deepStrictEqual(line('PHXS', ps, null, { version: '26.1.0' }), ['Editing Poster Final', '3000×4000 · 23 layers', 'Photoshop 2025 · 2 documents open']);
  assert.strictEqual(P.render('{tool}', P.buildVars('PHXS', ps, C.defaults())), 'Brush');
  ok('Photoshop');
  const ai = JSON.parse(hosts.load('ILST', {}).getInfo());
  assert.deepStrictEqual(line('ILST', ai, null, { version: '29.2.1' }), ['Designing Brand Icons', 'Instagram Post · 2 artboards · 4 layers', 'Illustrator 2025 · 1 document open']);
  ok('Illustrator');
  const au = JSON.parse(hosts.load('AUDT', {}).getInfo());
  assert.deepStrictEqual(line('AUDT', au, null, { version: '25.0' }), ['Mixing Podcast Ep 12', 'Multitrack session · 48 kHz', 'Audition 2025']);
  ok('Audition');
  const st = { status: 'running' };
  const ame = hosts.load('AME', st);
  ame.ctx.__fire('onItemEncodingStarted', { sourceFilePath: 'C:/v/Vlog Final.mp4', outputFilePath: 'C:/o/Vlog Final_1.mp4' });
  ame.ctx.__fire('onEncodingItemProgressUpdate', { progress: 0.43 });
  let info = JSON.parse(ame.getInfo());
  const s = C.defaults();
  assert.strictEqual(P.decideMode(info, s.apps.AME, s, false, false), 'rendering');
  const v = P.buildVars('AME', info, s, { timeLeft: 190 });
  assert.strictEqual(P.render(s.apps.AME.renderDetails, v), 'Encoding Vlog Final');
  assert.strictEqual(P.render(s.apps.AME.renderState, v), '40%');
  assert.strictEqual(v.timeLeft, '3:10');
  const act = P.buildActivity('AME', 'rendering', v, s, 1, { countdown: { start: 100, end: 900 } });
  assert.deepStrictEqual(act.timestamps, { start: 100, end: 900 });
  ame.ctx.__fire('onItemEncodeComplete', { result: 'True' }); st.status = 'stopped';
  info = JSON.parse(ame.getInfo());
  assert.strictEqual(P.decideMode(info, s.apps.AME, s, false, false), 'hidden');
  assert.strictEqual(P.buildActivity('AME', 'hidden', {}, s, 1), null);
  ok('Media Encoder: progress, countdown, hidden while idle');
  assert.strictEqual(P.versionParts('26.0', 'PHXS').year, '2025');
  assert.strictEqual(P.versionParts('30.0', 'ILST').year, '2026');
  assert.strictEqual(P.versionParts('26.0', 'PPRO').year, '2026');
  ok('Version → year per app');

  console.log('Private folders');
  const base = C.defaults();
  const priv = (p, mut) => { const x = C.defaults(); mut(x); return P.isPrivate({ path: p }, x); };
  assert.strictEqual(priv('D:\\Work\\Clients\\Acme\\Poster.psd', (x) => { x.privateFolders = ['Clients']; }), true);
  assert.strictEqual(priv('D:\\Work\\MyClientsList\\Poster.psd', (x) => { x.privateFolders = ['Clients']; }), false);
  assert.strictEqual(priv('D:\\Work\\Clients\\Acme\\x.prproj', (x) => { x.privateFolders = ['d:/work/clients/']; }), true);
  assert.strictEqual(priv('E:\\Work\\Clients\\x.prproj', (x) => { x.privateFolders = ['D:\\Work\\Clients']; }), false);
  assert.strictEqual(priv('C:\\a\\Secret.aep', (x) => { x.privateProjects = ['c:/a/secret.aep']; }), true);
  assert.strictEqual(P.isPrivate({ path: 'C:\\a\\b.aep' }, base), false);
  assert.deepStrictEqual(line('PHXS', ps, (x) => { x.privateFolders = ['Clients']; }).slice(0, 1), ['Editing a secret project']);
  ok('Folder names, full paths, exact projects');

  console.log('Time tracking');
  let store = null;
  const T = new TT.Tracker({ read: () => store, write: (d) => { store = JSON.parse(JSON.stringify(d)); } });
  const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
  T.add('Vlog', 3600, now); T.add('Vlog', 600, now); T.add('Ad', 1200, now - 86400000);
  assert.strictEqual(T.today(now), 4200); assert.strictEqual(T.week(now), 5400); assert.strictEqual(T.project('Vlog'), 4200);
  T.save(true);
  const T2 = new TT.Tracker({ read: () => store, write: () => {} });
  assert.strictEqual(T2.project('Ad'), 1200);
  const sum = TT.summarize({ PPRO: store, AEFT: { days: { [TT.dayKey(now)]: { total: 900, projects: { Logo: 900 } } }, projects: { Logo: { total: 900 } } } }, now);
  assert.strictEqual(sum.today, 5100); assert.strictEqual(sum.week, 6300);
  assert.deepStrictEqual(sum.projects.map((p) => p.host + ':' + p.name), ['PPRO:Vlog', 'PPRO:Ad', 'AEFT:Logo']);
  assert.strictEqual(sum.days.length, 7);
  const tv = P.buildVars('PPRO', { project: 'Vlog', hasProject: true }, C.defaults(), { time: { today: 4200, project: 4200, week: 5400 } });
  assert.strictEqual(tv.todayTime, '1h 10m'); assert.strictEqual(tv.weekTime, '1h 30m');
  ok('Per day / week / project, multi-app summary, {todayTime}');

  console.log('Zip + updater');
  // Build a fake signed release with Python's zipfile (deflate + stored, like a real .zxp).
  const v2src = path.join(tmp, 'v2');
  fs.cpSync(ext, v2src, { recursive: true });
  const man = path.join(v2src, 'CSXS', 'manifest.xml');
  fs.writeFileSync(man, fs.readFileSync(man, 'utf8').replace(/ExtensionBundleVersion="[^"]+"/, 'ExtensionBundleVersion="9.9.9"'));
  fs.mkdirSync(path.join(v2src, 'META-INF'));
  fs.writeFileSync(path.join(v2src, 'META-INF', 'signatures.xml'), '<signatures/>');
  fs.writeFileSync(path.join(v2src, 'NEW_FILE.txt'), 'hello from 9.9.9');
  const zxp = path.join(tmp, 'DiscordPresence-9.9.9.zxp');
  execFileSync('python3', ['-c', `
import zipfile, os, sys
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/vnd.adobe.air-ucf-package+zip')
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src).replace(os.sep, '/'), compress_type=zipfile.ZIP_DEFLATED)
`, v2src, zxp]);
  const files = Zip.extract(fs.readFileSync(zxp), path.join(tmp, 'unzipped'));
  assert.ok(files.includes('CSXS/manifest.xml') && files.includes('mimetype'));
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'unzipped', 'NEW_FILE.txt'), 'utf8'), 'hello from 9.9.9');
  ok('Zip extractor (stored + deflate)');
  const evil = path.join(tmp, 'evil.zip');
  execFileSync('python3', ['-c', `import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z: z.writestr('../../escape.txt','x')`, evil]);
  assert.throws(() => Zip.extract(fs.readFileSync(evil), path.join(tmp, 'evil-out')), /Unsafe path/);
  ok('Zip extractor refuses ../ paths');

  // "Installed" extension v1.0.0 in a fake CEP extensions folder.
  const extDir = path.join(tmp, 'CEP', 'extensions', 'com.happyfew.discordpresence');
  fs.cpSync(ext, extDir, { recursive: true });
  const zbuf = fs.readFileSync(zxp);
  const hash = crypto.createHash('sha256').update(zbuf).digest('hex');
  let sumsText = hash + '  DiscordPresence-9.9.9.zxp\n';
  const fakeGet = (url, cb) => setTimeout(() => {
    if (/releases\/latest$/.test(url)) return cb(null, Buffer.from(JSON.stringify({
      tag_name: 'v9.9.9', html_url: 'https://github.com/me/repo/releases/tag/v9.9.9', body: 'New stuff',
      assets: [{ name: 'DiscordPresence-9.9.9.zxp', browser_download_url: 'https://x/zxp' },
        { name: 'checksums.txt', browser_download_url: 'https://x/sums' }] })));
    if (url === 'https://x/sums') return cb(null, Buffer.from(sumsText));
    if (url === 'https://x/zxp') return cb(null, zbuf);
    cb(new Error('HTTP 404'));
  }, 5);
  const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir);
  const mk = () => new U.Updater({ repo: 'me/repo', extDir, dataDir, get: fakeGet, zip: Zip });
  const call = (u, m) => new Promise((res) => u[m]((err, st) => res({ err, st })));

  // Tampered checksum → refuses, nothing changes.
  sumsText = 'a'.repeat(64) + '  DiscordPresence-9.9.9.zxp\n';
  let up = mk();
  let r = await call(up, 'check');
  assert.strictEqual(r.st.available, true); assert.strictEqual(r.st.latest, '9.9.9'); assert.strictEqual(r.st.running, '1.0.0');
  r = await call(up, 'install');
  assert.ok(/Checksum mismatch/.test(r.err.message), r.err && r.err.message);
  assert.strictEqual(U.manifestInfo(extDir).version, '1.0.0');
  assert.ok(!fs.existsSync(path.join(extDir, 'NEW_FILE.txt')));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(extDir)), ['com.happyfew.discordpresence']);
  ok('Update with a bad checksum is refused and leaves the install untouched');

  sumsText = hash + '  DiscordPresence-9.9.9.zxp\n';
  up = mk();
  await call(up, 'check');
  r = await call(up, 'install');
  assert.ifError(r.err);
  assert.strictEqual(U.manifestInfo(extDir).version, '9.9.9');
  assert.strictEqual(fs.readFileSync(path.join(extDir, 'NEW_FILE.txt'), 'utf8'), 'hello from 9.9.9');
  assert.ok(fs.existsSync(path.join(extDir, 'META-INF', 'signatures.xml')));
  assert.strictEqual(r.st.restartNeeded, true); assert.strictEqual(r.st.running, '1.0.0'); assert.strictEqual(r.st.installed, '9.9.9');
  assert.deepStrictEqual(fs.readdirSync(path.dirname(extDir)), ['com.happyfew.discordpresence']);
  assert.ok(!fs.existsSync(path.join(dataDir, 'update.lock')));
  ok('Update downloads, verifies, swaps folders, asks for a restart');
  r = await call(mk(), 'check');
  assert.strictEqual(r.st.available, false);
  ok('After updating: up to date');

  // Unsigned package is refused.
  const unsigned = path.join(tmp, 'unsigned.zxp');
  fs.rmSync(path.join(v2src, 'META-INF'), { recursive: true });
  const man2 = path.join(v2src, 'CSXS', 'manifest.xml');
  fs.writeFileSync(man2, fs.readFileSync(man2, 'utf8').replace('9.9.9', '10.0.0'));
  execFileSync('python3', ['-c', `import zipfile,os,sys\nsrc,out=sys.argv[1],sys.argv[2]\nwith zipfile.ZipFile(out,'w') as z:\n  [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),src)) for r,d,fs in os.walk(src) for f in fs]`, v2src, unsigned]);
  const ub = fs.readFileSync(unsigned);
  const g2 = (url, cb) => setTimeout(() => {
    if (/latest$/.test(url)) return cb(null, Buffer.from(JSON.stringify({ tag_name: '10.0.0', assets: [
      { name: 'x-10.0.0.zxp', browser_download_url: 'z' }, { name: 'checksums.txt', browser_download_url: 's' }] })));
    if (url === 's') return cb(null, Buffer.from(crypto.createHash('sha256').update(ub).digest('hex') + '  x-10.0.0.zxp'));
    cb(null, ub);
  }, 5);
  up = new U.Updater({ repo: 'me/repo', extDir, dataDir, get: g2, zip: Zip });
  await call(up, 'check');
  r = await call(up, 'install');
  assert.ok(/not signed/.test(r.err.message)); assert.strictEqual(U.manifestInfo(extDir).version, '9.9.9');
  ok('Unsigned package is refused');
  assert.strictEqual(U.compare('1.10.0', '1.9.3'), 1); assert.strictEqual(U.compare('v2.0.0', '2.0.0'), 0);
  ok('Version compare');

  console.log('\n' + passed + ' feature checks passed');
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
