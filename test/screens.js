// Renders the panel in a few states and saves screenshots.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const C = require('../extension/shared/config.js');
const hosts = require('./mock-hosts');

const out = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(out, { recursive: true });
const panel = 'file://' + path.join(__dirname, '..', 'extension', 'panel', 'index.html');
const fake = fs.readFileSync(path.join(__dirname, 'fake-cep.js'), 'utf8');

function settings(mut) { const s = C.defaults(); mut && mut(s); return s; }

const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e8590c"/><circle cx="32" cy="32" r="16" fill="#fff"/></svg>');
const now = Date.now();
const cases = [
  { name: 'ppro-watching', host: 'PPRO',
    settings: settings((s) => { s.apps.PPRO.clientId = '1290000000000000001'; }),
    status: { host: 'PPRO', discord: { state: 'connected' }, hasClientId: true, mode: 'watching', playing: true,
      app: { ok: true, name: 'Premiere Pro', iconUrl: icon, assets: ['banner'] },
      images: { large: { value: icon, source: 'icon', previewUrl: icon, missingKey: 'logo' } },
      activity: { timestamps: { start: now - 61000, end: now - 61000 + 754000 } },
      info: JSON.parse(hosts.load('PPRO', { playhead: 61 }).getInfo()) } },
  { name: 'ppro-connected', host: 'PPRO',
    settings: settings((s) => { s.apps.PPRO.clientId = '1290000000000000001'; s.buttons[0] = { label: 'My portfolio', url: 'https://example.com' }; }),
    status: { host: 'PPRO', discord: { state: 'connected', user: { username: 'happyfew' } }, hasClientId: true, mode: 'active',
      info: JSON.parse(hosts.load('PPRO', { playhead: 61 }).getInfo()) } },
  { name: 'ae-rendering', host: 'AEFT', tab: 'behavior',
    settings: settings((s) => { s.apps.AEFT.clientId = '1290000000000000002'; }),
    status: { host: 'AEFT', discord: { state: 'connected' }, hasClientId: true, mode: 'rendering',
      info: JSON.parse(hosts.load('AEFT', { rendering: true }).getInfo()) } },
  { name: 'ppro-setup', host: 'PPRO', settings: settings(),
    status: { host: 'PPRO', discord: { state: 'idle' }, hasClientId: false, mode: 'noProject', info: { hasProject: false, version: '25.1.0' } } },
  { name: 'ae-discord-closed-light', host: 'AEFT', tab: 'media', bg: { red: 214, green: 214, blue: 214 },
    settings: settings((s) => { s.apps.AEFT.clientId = '1290000000000000002'; }),
    status: { host: 'AEFT', discord: { state: 'error', error: 'Discord is not running (no IPC pipe found)' }, hasClientId: true, mode: 'active',
      info: JSON.parse(hosts.load('AEFT', {}).getInfo()) } }
];

// Time-tracking sample data
const TT = require('../extension/shared/timetrack.js');
function timeData(entries) {
  let store = null;
  const t = new TT.Tracker({ read: () => null, write: (d) => { store = d; } });
  entries.forEach(([proj, hours, daysAgo]) => t.add(proj, hours * 3600, Date.now() - daysAgo * 86400000));
  t.save(true);
  return store;
}
const files = {
  'time-PPRO.json': timeData([['Summer "Trip" Vlog', 2.4, 0], ['Summer "Trip" Vlog', 3.1, 1], ['Client Ad 30s', 1.5, 2], ['Summer "Trip" Vlog', 1.2, 4], ['Wedding Teaser', 2.8, 5]]),
  'time-AEFT.json': timeData([['Brand Kit 2026', 0.9, 0], ['Brand Kit 2026', 1.6, 3], ['Lower Thirds', 0.7, 6]]),
  'time-PHXS.json': timeData([['Poster Final', 0.6, 0], ['Thumbnail v4', 0.4, 1]])
};
const upd = { state: 'idle', running: '1.2.0', installed: '1.2.0', latest: '1.3.0', available: true, checkedAt: now, url: 'https://github.com/happyfew/adobe-discord-presence/releases/tag/v1.3.0' };
const psInfo = JSON.parse(hosts.load('PHXS', {}).getInfo());
cases.push(
  { name: 'ppro-time', host: 'PPRO', tab: 'time', files, settings: settings((s) => { s.apps.PPRO.clientId = '1'; }),
    status: { host: 'PPRO', discord: { state: 'connected' }, hasClientId: true, mode: 'active', info: JSON.parse(hosts.load('PPRO', { playhead: 61 }).getInfo()) } },
  { name: 'ps-behavior-update', host: 'PHXS', appName: 'PHXS', appVersion: '26.1.0', tab: 'behavior', files, dist: { githubRepo: 'happyfew/adobe-discord-presence' },
    settings: settings((s) => { s.apps.PHXS.clientId = '1'; s.privateFolders = ['Clients']; }),
    status: { host: 'PHXS', appVersion: '26.1.0', discord: { state: 'connected' }, hasClientId: true, mode: 'active', update: upd, timeKey: 'Poster Final', info: psInfo } },
  { name: 'ame-encoding-from-ppro', host: 'PPRO', switchTo: 'AME', files: Object.assign({}, files, {
      'status-AME.json': { ts: now, host: 'AME', appVersion: '25.0.0', discord: { state: 'connected' }, hasClientId: true, mode: 'rendering',
        activity: { state: '40%', timestamps: { start: now - 140000, end: now + 190000 } }, vars: { timeLeft: '3:10' },
        info: { host: 'AME', hasProject: true, rendering: true, progress: 0.43, itemStarted: now - 140000, file: 'Vlog Final', output: 'Vlog Final_1.mp4', done: 2 } } }),
    settings: settings((s) => { s.apps.AME.clientId = '1'; s.apps.PPRO.clientId = '1'; }),
    status: { host: 'PPRO', discord: { state: 'connected' }, hasClientId: true, mode: 'active', info: JSON.parse(hosts.load('PPRO', { playhead: 61 }).getInfo()) } }
);

(async () => {
  const browser = await chromium.launch();
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript('window.__FAKE__ = ' + JSON.stringify(c) + ';\n' + fake);
    await page.goto(panel);
    if (c.switchTo) await page.selectOption('#hostSelect', c.switchTo);
    if (c.tab) await page.click('.tab[data-tab="' + c.tab + '"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, c.name + '.png'), fullPage: true });
    console.log(c.name, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
    await page.close();
  }
  // Interaction: typing into a template updates preview + saves.
  const page = await browser.newPage({ viewport: { width: 360, height: 700 } });
  await page.addInitScript('window.__FAKE__ = ' + JSON.stringify(cases[1]) + ';\n' + fake);
  await page.goto(panel);
  await page.fill('[data-key="app.details"]', 'Cutting ');
  await page.click('.var:has(code:text("{project}"))');
  await page.waitForTimeout(700);
  const pv = await page.textContent('#pvDetails');
  const saved = await page.evaluate(() => JSON.parse(window.__files['C:\\Users\\happy\\AppData\\Roaming\\AdobeDiscordPresence\\settings.json'].data).apps.PPRO.details);
  console.log('interaction preview="' + pv + '" saved="' + saved + '"');
  await browser.close();
})();
