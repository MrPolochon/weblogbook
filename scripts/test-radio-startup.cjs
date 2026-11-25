const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', '__dirname', 'process', code)(n => dependencies[n] || require(n), mod, mod.exports, '/app/dist-electron', { env: {} });
  return mod.exports;
}
const startup = load('vhf-radio-app/electron/startup.ts');
test('mandatory startup blocks login during checks, download, errors and restart', () => {
  let opens = 0, installs = 0;
  const gate = new startup.StartupGate(() => opens++, () => installs++);
  for (const status of ['idle', 'checking', 'error', 'checking', 'downloading']) gate.update({ status });
  assert.equal(gate.ready, false); assert.equal(opens, 0);
  gate.update({ status: 'downloaded' }); gate.update({ status: 'downloaded' });
  assert.equal(installs, 1); assert.equal(opens, 0); assert.equal(gate.ready, false);
  gate.update({ status: 'error' }); gate.update({ status: 'downloaded' }); assert.equal(installs, 2);
});
test('confirmed current version unlocks once; background downloads do not restart a running session', () => {
  let opens = 0, installs = 0;
  const gate = new startup.StartupGate(() => opens++, () => installs++);
  gate.update({ status: 'up-to-date' }); gate.update({ status: 'up-to-date' }); gate.update({ status: 'downloaded' });
  assert.equal(gate.ready, true); assert.equal(opens, 1); assert.equal(installs, 0);
});
test('production window and both Radio menu entries are gated until updater confirmation', async () => {
  let win, menu, notify, installs = 0;
  class BrowserWindow extends EventEmitter {
    constructor() { super(); win = this; this.urls = []; this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: () => {} }); }
    loadURL(url) { this.urls.push(url); return Promise.resolve(); }
    loadFile(file) { this.urls.push(file); return Promise.resolve(); }
    isDestroyed() { return false; }
  }
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve(), getVersion: () => '1.5.7' });
  const Menu = { buildFromTemplate: rows => rows, setApplicationMenu: rows => { menu = rows; }, getApplicationMenu: () => ({ getMenuItemById: () => undefined }) };
  load('vhf-radio-app/electron/main.ts', { electron: { app, BrowserWindow, Menu }, './ptt': { installPtt: () => {} }, './startup': startup,
    './updates': { installDesktopUpdates: (_window, callback, url) => { notify = callback; assert.equal(url, startup.startupUrl); return { install: () => installs++ }; } } });
  await Promise.resolve();
  const links = menu[0].submenu.slice(0, 2);
  links.forEach(link => link.click()); assert.deepEqual(win.urls, [startup.startupUrl]);
  let blocked = false;
  win.webContents.emit('will-navigate', { preventDefault: () => { blocked = true; } }, 'https://www.mixouairlinesptfsweblogbook.com/login');
  assert.equal(blocked, true);
  notify({ status: 'error' }); links[0].click(); assert.equal(win.urls.length, 1);
  notify({ status: 'downloaded' }); assert.equal(installs, 1); assert.equal(win.urls.length, 1);
  notify({ status: 'up-to-date' }); assert.match(win.urls.at(-1), /\/pilote$/);
  links[1].click(); assert.match(win.urls.at(-1), /index.html$/);
});
