const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
// CC_SRC = the desktop app checkout (package.json, main.js, src/, renderer/); CC_DATA = the synthetic CSVs.
const SRC = process.env.CC_SRC ? path.resolve(process.env.CC_SRC) : path.resolve(__dirname, '..', 'src');
const DATA = process.env.CC_DATA ? path.resolve(process.env.CC_DATA) : (fs.existsSync(path.resolve(__dirname, '..', 'sample-data')) ? path.resolve(__dirname, '..', 'sample-data') : path.resolve(__dirname, '..', 'data'));
const SHOTS = path.resolve(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Test-only account created on a throw-away profile (synthetic data). Override with QA_ADMIN_USER / QA_ADMIN_PASSWORD.
const ADMIN = { username: process.env.QA_ADMIN_USER || 'qa-admin', password: process.env.QA_ADMIN_PASSWORD || 'qa-only-' + require('os').hostname(), displayName: 'QA Admin' };

async function launch(opts = {}) {
  const app = await _electron.launch({
    executablePath: path.join(SRC, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', SRC],
    cwd: SRC,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', TZ: 'America/Los_Angeles' },
    timeout: 90000,
  });
  const log = { console: [], errors: [], main: [] };
  app.process().stdout.on('data', d => log.main.push('[out] ' + String(d).trim()));
  app.process().stderr.on('data', d => { const s = String(d).trim(); if (!/dbus|Security Warning|Policy set|unnecessary security|For more information|electronjs.org|^$/.test(s)) log.main.push('[err] ' + s); });
  // capture mailto / external opens in main
  await app.evaluate(({ shell, app }) => { global.__opened = []; app.isNavigatingMainWindow = true; shell.openExternal = (u) => { global.__opened.push(u); return Promise.resolve(); }; });
  const win = await app.firstWindow({ timeout: 90000 });
  attach(win, log);
  await win.waitForLoadState('domcontentloaded');
  return { app, win, log };
}
function attach(win, log) {
  win.on('console', m => { const t = m.type(); const txt = m.text(); if (t === 'error' || t === 'warning') log.console.push('[' + t + '] ' + txt.slice(0, 400)); });
  win.on('pageerror', e => log.errors.push(e.message + '\n' + String(e.stack || '').split('\n').slice(0, 3).join('\n')));
  win.on('dialog', async d => { log.console.push('[dialog ' + d.type() + '] ' + d.message().slice(0, 200)); try { await d.accept(); } catch (_) {} });
}
async function signIn({ app, win, log }) {
  await win.waitForTimeout(1500);
  const state = await win.evaluate(() => ({ first: getComputedStyle(document.getElementById('firstRunForm')).display !== 'none', login: getComputedStyle(document.getElementById('loginForm')).display !== 'none' }));
  if (state.first) {
    await win.fill('#frDistrict', 'Riverbend School District');
    await win.fill('#frCity', 'Pasco');
    await win.fill('#frState', 'WA');
    await win.fill('#frDisplayName', ADMIN.displayName);
    await win.fill('#frUsername', ADMIN.username);
    await win.fill('#frPassword', ADMIN.password);
    await win.fill('#frPassword2', ADMIN.password);
    await win.click('#frBtn');
  } else {
    await win.fill('#username', ADMIN.username);
    await win.fill('#password', ADMIN.password);
    await win.click('#loginBtn');
  }
  await win.waitForURL(/Command_center/i, { timeout: 60000 });
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(4000);
  return win;
}
/** set files on an input and wait for a window event (or timeout) */
async function importFile(win, selector, files, evt, ms = 20000) {
  const wait = win.evaluate(({ evt, ms }) => new Promise(res => { const t = setTimeout(() => res('timeout'), ms); window.addEventListener(evt, () => { clearTimeout(t); res('event'); }, { once: true }); }), { evt, ms });
  await win.setInputFiles(selector, files.map(f => path.join(DATA, f)));
  const r = await wait;
  await win.waitForTimeout(800);
  return r;
}
async function setSize(app, w, h) {
  await app.evaluate(({ BrowserWindow }, { w, h }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setContentSize(w, h); }, { w, h });
  await new Promise(r => setTimeout(r, 800));
}
async function shot(win, name, full = false) { await win.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); }
function dump(log, name) { fs.writeFileSync(path.join(__dirname, name + '.log.json'), JSON.stringify(log, null, 1)); }
module.exports = { launch, signIn, importFile, setSize, shot, dump, SRC, DATA, SHOTS, ADMIN };
