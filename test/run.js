// End-to-end-ish tests: host scripts with mocked apps, template logic,
// and the real background service talking to a fake Discord.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adp-'));
process.env.XDG_RUNTIME_DIR = path.join(tmp, 'run');
process.env.ADP_DATA_DIR = path.join(tmp, 'data');
fs.mkdirSync(process.env.XDG_RUNTIME_DIR);

const ext = path.join(__dirname, '..', 'extension');
const hosts = require('./mock-hosts');
const mock = require('./mock-discord');
const P = require(path.join(ext, 'shared', 'presence.js'));
const C = require(path.join(ext, 'shared', 'config.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓ ' + name); };

(async () => {
  console.log('Host scripts');
  const pr = JSON.parse(hosts.load('PPRO', { playhead: 61.5 }).getInfo());
  assert.strictEqual(pr.project, 'Summer "Trip" Vlog');
  assert.strictEqual(pr.sequence, 'Main Edit v3');
  assert.strictEqual(pr.clips, 16); assert.strictEqual(pr.audioClips, 11);
  assert.strictEqual(Number(pr.fps.toFixed(3)), 23.976);
  assert.strictEqual(pr.width, 3840); assert.strictEqual(pr.selected, 2);
  ok('Premiere project/sequence info ' + JSON.stringify(pr));
  assert.strictEqual(JSON.parse(hosts.load('PPRO', { noProject: true }).getInfo()).hasProject, false);
  ok('Premiere home screen = no project');
  const ae = JSON.parse(hosts.load('AEFT', {}).getInfo());
  assert.strictEqual(ae.project, 'Brand Kit 2026'); assert.strictEqual(ae.comp, 'Logo Reveal');
  assert.strictEqual(ae.comps, 2); assert.strictEqual(ae.layers, 14); assert.strictEqual(ae.rendering, false);
  ok('After Effects comp info ' + JSON.stringify(ae));
  const aer = JSON.parse(hosts.load('AEFT', { rendering: true }).getInfo());
  assert.strictEqual(aer.rendering, true); assert.strictEqual(aer.queued, 2); assert.strictEqual(aer.renderComp, 'Logo Reveal');
  ok('After Effects render queue');
  assert.strictEqual(JSON.parse(hosts.load('AEFT', { empty: true }).getInfo()).hasProject, false);
  ok('After Effects empty untitled = no project');

  console.log('Templates');
  const s = C.defaults();
  let v = P.buildVars('PPRO', pr, s);
  assert.strictEqual(P.render(s.apps.PPRO.details, v), 'Editing Summer "Trip" Vlog');
  assert.strictEqual(P.render(s.apps.PPRO.state, v), 'Main Edit v3 · 4K · 23.976 fps');
  assert.strictEqual(P.render(s.apps.PPRO.largeText, v), 'Premiere Pro 2025 · 16 clips · 4 sequences');
  ok('Premiere defaults render');
  v = P.buildVars('PPRO', Object.assign({}, pr, { sequence: undefined, width: undefined, height: undefined }), s);
  assert.strictEqual(P.render(s.apps.PPRO.state, v), '23.976 fps');
  ok('Parts with empty variables are dropped');
  v = P.buildVars('PPRO', pr, Object.assign({}, s, { privacy: true }));
  assert.strictEqual(P.render(s.apps.PPRO.details, v), 'Editing a secret project');
  assert.strictEqual(P.render(s.apps.PPRO.state, v), '4K · 23.976 fps');
  ok('Privacy mode hides names');
  v = P.buildVars('AEFT', aer, s);
  assert.strictEqual(P.render(s.apps.AEFT.state, v), 'Logo Reveal · 14 layers · Vertical 1080p');
  assert.strictEqual(P.render(s.apps.AEFT.renderState, v), 'Logo Reveal · 2 items in queue');
  ok('After Effects defaults render');
  assert.strictEqual(P.fit('x'.repeat(200)).length, 128);
  assert.strictEqual(P.fit('a').length, 2);
  ok('Length limits (2–128)');
  const sb = Object.assign({}, s, { buttons: [{ label: 'My portfolio', url: 'https://example.com' }, { label: 'bad', url: 'nope' }] });
  const act = P.buildActivity('PPRO', 'active', P.buildVars('PPRO', pr, sb), sb, 1700000000000);
  assert.deepStrictEqual(act.buttons, [{ label: 'My portfolio', url: 'https://example.com' }]);
  assert.strictEqual(act.timestamps.start, 1700000000000);
  assert.strictEqual(act.assets.large_image, 'logo');
  ok('Activity payload ' + JSON.stringify(act));

  const T = new P.PlaybackTracker();
  let t0 = 1e6;
  for (let i = 0; i < 12; i++) T.feed('seq', 10 + i, t0 + i * 1000);
  assert.ok(Math.abs(T.playingFor(t0 + 11000) - 11) < 0.01);
  T.feed('seq', 21, t0 + 12000); T.feed('seq', 21, t0 + 13000);
  assert.strictEqual(T.playingFor(t0 + 13000), 0);
  const T2 = new P.PlaybackTracker();
  T2.feed('seq', 5, t0); T2.feed('seq', 300, t0 + 1000); T2.feed('seq', 300, t0 + 2000);
  assert.strictEqual(T2.playingFor(t0 + 2000), 0);
  ok('Playback tracker: real-time movement yes, pauses/jumps no');
  const DA = require(path.join(ext, 'shared', 'discord-app.js'));
  const info = { id: '42', ok: true, iconUrl: 'https://cdn/icon.png', assets: [{ id: '7', name: 'logo' }] };
  assert.strictEqual(DA.resolveImage('LOGO', info, true).value, 'logo');
  assert.strictEqual(DA.resolveImage('nope', info, true).value, 'https://cdn/icon.png');
  assert.strictEqual(DA.resolveImage('nope', Object.assign({}, info, { iconUrl: '' }), true).value, '');
  assert.strictEqual(DA.resolveImage('icon', info, false).value, 'https://cdn/icon.png');
  assert.strictEqual(DA.resolveImage('https://x.y/a.gif', info, true).value, 'https://x.y/a.gif');
  ok('Image resolver (asset / URL / icon fallback)');

  console.log('Background service ↔ fake Discord');
  const srv = await mock.start(process.env.XDG_RUNTIME_DIR, { rejectClientId: 'badid' });
  const settings = C.defaults();
  settings.pollSeconds = 2;
  settings.apps.PPRO.clientId = '111111111111111111';
  C.save(settings);

  // Fake CEP environment
  const hostState = { playhead: 10 };
  let jsx = hosts.load('PPRO', hostState);
  global.window = global;
  // Fake Discord web API for app info / art assets.
  const { EventEmitter } = require('events');
  const fakeHttps = { get(url, opts, cb) {
    const res = new EventEmitter(); res.setEncoding = () => {}; res.statusCode = 200;
    const body = /\/rpc$/.test(url) ? { id: '111111111111111111', name: 'Premiere Pro', icon: 'abc123' }
      : [{ id: '5', type: 1, name: 'banner' }];
    const req = new EventEmitter(); req.destroy = () => {};
    setTimeout(() => { cb(res); res.emit('data', JSON.stringify(body)); res.emit('end'); }, 10);
    return req;
  } };
  global.cep_node = { require: (m) => (m === 'https' ? fakeHttps : require(m)), process };
  global.addEventListener = () => {};
  global.SystemPath = { EXTENSION: 'extension' };
  global.CSInterface = function () {};
  CSInterface.prototype.getHostEnvironment = () => ({ appName: 'PPRO', appVersion: '25.1.0' });
  CSInterface.prototype.getSystemPath = () => ext;
  CSInterface.prototype.evalScript = (script, cb) => setTimeout(() => {
    if (script === 'typeof DiscordPresenceHost') return cb('object');
    jsx = hosts.load('PPRO', hostState);
    if (script.indexOf('playhead()') >= 0) return cb(jsx.playhead());
    cb(jsx.getInfo());
  }, 20);
  for (const f of ['shared/distribution.js', 'shared/config.js', 'shared/presence.js', 'shared/discord-ipc.js', 'shared/discord-app.js', 'shared/timetrack.js', 'shared/zip.js', 'shared/updater.js', 'background/background.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(ext, f), 'utf8'), { filename: f });
    if (f === 'shared/distribution.js') window.DP_DIST.githubRepo = ''; // keep the real updater out of this test
  }
  const acts = () => srv.received.filter((r) => r.msg.cmd === 'SET_ACTIVITY');
  await sleep(3000);
  assert.ok(srv.received.some((r) => r.op === 0 && r.msg.client_id === '111111111111111111'), 'handshake sent');
  let last = acts().pop();
  assert.ok(last, 'activity sent');
  assert.strictEqual(last.msg.args.activity.details, 'Editing Summer "Trip" Vlog');
  assert.strictEqual(last.msg.args.pid, process.pid);
  ok('Handshake + first presence: ' + last.msg.args.activity.details + ' / ' + last.msg.args.activity.state);
  const status = C.readJSON(C.statusPath('PPRO'));
  assert.strictEqual(status.discord.state, 'connected'); assert.strictEqual(status.mode, 'active');
  ok('Status file for the panel');
  assert.strictEqual(last.msg.args.activity.assets.large_image, 'https://cdn.discordapp.com/app-icons/111111111111111111/abc123.png?size=512');
  assert.strictEqual(status.images.large.missingKey, 'logo');
  assert.strictEqual(status.app.name, 'Premiere Pro');
  ok('Missing art asset "logo" → falls back to the app icon');
  settings.apps.PPRO.largeImage = 'Banner'; C.save(settings);
  await sleep(2500);
  assert.strictEqual(acts().pop().msg.args.activity.assets.large_image, 'banner');
  ok('Existing art asset is used (case-insensitive)');
  window.DP_DIST.appIds.PPRO = '999';
  assert.strictEqual(window.DP.Config.clientId({ apps: { PPRO: { clientId: '' } } }, 'PPRO'), '999');
  assert.strictEqual(window.DP.Config.clientId({ apps: { PPRO: { clientId: '123' } } }, 'PPRO'), '123');
  window.DP_DIST.appIds.PPRO = '';
  ok('Built-in app ID used unless the user sets their own');

  const before = acts().length;
  await sleep(4500);
  assert.strictEqual(acts().length, before, 'no duplicate updates when nothing changes');
  ok('No spam when nothing changes');

  settings.privacy = true; C.save(settings);
  await sleep(2500);
  last = acts().pop();
  assert.strictEqual(last.msg.args.activity.details, 'Editing a secret project');
  ok('Settings change picked up live');

  settings.idleMinutes = 0.05; C.save(settings); // 3 s
  await sleep(6500);
  last = acts().pop();
  assert.strictEqual(last.msg.args.activity.details, 'Idle in a secret project');
  ok('Idle detection');
  hostState.playhead = 99;
  await sleep(6500);
  last = acts().pop();
  assert.strictEqual(last.msg.args.activity.details, 'Editing a secret project');
  ok('Back from idle when the playhead moves');

  settings.idleMinutes = 10; settings.privacy = false; settings.apps.PPRO.watchAfterSeconds = 3; C.save(settings);
  await sleep(1500);
  const play = setInterval(() => { hostState.playhead += 0.25; }, 250);
  await sleep(2000);
  assert.notStrictEqual(acts().pop().msg.args.activity.type, 3);
  ok('Short playback (< 3 s) does not switch');
  await sleep(4000);
  last = acts().pop().msg.args.activity;
  assert.strictEqual(last.type, 3, JSON.stringify(last));
  assert.strictEqual(last.details, 'Reviewing Summer "Trip" Vlog');
  assert.strictEqual(last.state, 'Playing back Main Edit v3');
  assert.strictEqual(last.timestamps.end - last.timestamps.start, 754000);
  assert.ok(Math.abs(Date.now() - last.timestamps.start - hostState.playhead * 1000) < 3500);
  ok('Playback → "Watching" with progress bar ' + JSON.stringify(last));
  const n = acts().length;
  await sleep(4500);
  assert.strictEqual(acts().length, n, 'progress bar does not cause update spam');
  ok('No update spam during playback');
  clearInterval(play);
  await sleep(5000);
  last = acts().pop().msg.args.activity;
  assert.strictEqual(last.type, undefined); assert.strictEqual(last.details, 'Editing Summer "Trip" Vlog');
  ok('Back to normal when playback stops');

  settings.apps.PPRO.enabled = false; C.save(settings);
  await sleep(4500);
  last = acts().pop();
  assert.strictEqual(last.msg.args.activity, undefined);
  ok('Pausing clears the presence');

  settings.apps.PPRO.clientId = 'badid'; settings.apps.PPRO.enabled = true; C.save(settings);
  await sleep(2500);
  const st2 = C.readJSON(C.statusPath('PPRO'));
  assert.strictEqual(st2.discord.state, 'error');
  assert.ok(/Invalid Client ID/.test(st2.discord.error), st2.discord.error);
  ok('Bad Client ID reported: ' + st2.discord.error);

  console.log('\n' + passed + ' checks passed');
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
