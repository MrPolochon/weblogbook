const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

function harness(t, startupUrl) {
  let checks = 0, installs = 0, reject = false, installFailure = false;
  const timers = new Set(), sent = [], handlers = new Map();
  const later = (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; };
  const ipcMain = Object.assign(new EventEmitter(), { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) });
  const powerMonitor = new EventEmitter();
  const frame = { url: 'https://www.mixouairlinesptfsweblogbook.com/atc' };
  const webContents = Object.assign(new EventEmitter(), { mainFrame: frame, send: (channel, state) => sent.push({ channel, state }) });
  let destroyed = false;
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => destroyed });
  Object.defineProperty(window, 'webContents', { get() { if (destroyed) throw new TypeError('Object has been destroyed'); return webContents; } });
  window.on('closed', () => { destroyed = true; });
  const autoUpdater = Object.assign(new EventEmitter(), {
    checkForUpdates: async () => { checks++; if (reject) throw Error('offline'); },
    quitAndInstall: () => { if (installFailure) throw Error('install failed'); installs++; },
  });
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('vhf-radio-app/electron/updates.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', '__dirname', 'process', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', code)(
    name => name === 'electron' ? { app: { getVersion: () => '1.5.3' }, ipcMain, powerMonitor } : name === 'electron-updater' ? { autoUpdater } : require(name),
    mod, mod.exports, '/app/dist-electron', { env: {} }, later, timer => timers.delete(timer), later, timer => timers.delete(timer));
  const api = mod.exports.installDesktopUpdates(window, undefined, startupUrl);
  const event = { sender: webContents, senderFrame: frame };
  t.after(() => window.emit('closed'));
  return { api, autoUpdater, window, powerMonitor, ipcMain, sent, timers, event,
    failInstall: () => { installFailure = true; }, checks: () => checks, installs: () => installs, offline: value => { reject = value; },
    snapshot: event => handlers.get('updater:get-state')(event),
    async fire(ms) { const timer = [...timers].find(t => t.ms === ms); assert.ok(timer, 'scheduled timer exists'); timer.fn(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test('Windows downloads automatically at launch, checks periodically and checks after sleep', async t => {
  const h = harness(t);
  assert.equal(h.autoUpdater.autoDownload, true); assert.equal(h.autoUpdater.autoInstallOnAppQuit, true);
  await h.fire(5000); assert.equal(h.checks(), 1);
  h.autoUpdater.emit('update-not-available'); await h.fire(30 * 60_000); assert.equal(h.checks(), 2);
  h.autoUpdater.emit('update-not-available'); h.powerMonitor.emit('resume'); await Promise.resolve(); assert.equal(h.checks(), 3);
  assert.equal(h.installs(), 0, 'never force a restart during the session');
});

test('a downloaded update survives page navigation and exposes version/progress to a newly opened COM', async t => {
  const h = harness(t); await h.api.check();
  h.autoUpdater.emit('update-available', { version: '1.5.4' });
  h.autoUpdater.emit('download-progress', { percent: 42.4 });
  assert.equal(h.snapshot(h.event).percent, 42);
  await h.api.check(); assert.equal(h.checks(), 1, 'no concurrent download or check');
  h.autoUpdater.emit('update-downloaded', { version: '1.5.4' });
  h.window.webContents.emit('did-finish-load');
  assert.deepEqual(h.snapshot(h.event), { status: 'downloaded', currentVersion: '1.5.3', version: '1.5.4', percent: 100 });
  assert.ok(h.sent.some(item => item.channel === 'updater:status' && item.state === 'downloaded'));
  assert.equal(h.installs(), 0); assert.equal(h.api.install(), true); assert.equal(h.installs(), 1);
});

test('network errors retry automatically and a failed check cannot install an update', async t => {
  const h = harness(t); h.offline(true); await h.api.check();
  assert.equal(h.api.getState().status, 'error'); assert.equal(h.api.install(), false);
  h.offline(false); await h.fire(5 * 60_000); assert.equal(h.checks(), 2);
  h.autoUpdater.emit('update-not-available'); assert.equal(h.api.getState().status, 'up-to-date');
});

test('updater IPC rejects foreign frames and installs only a downloaded update', async t => {
  const h = harness(t);
  const foreign = { sender: h.event.sender, senderFrame: { url: 'https://evil.test' } };
  assert.equal(h.snapshot(foreign), null);
  h.ipcMain.emit('updater:check', foreign); assert.equal(h.checks(), 0);
  h.ipcMain.emit('updater:install', h.event); assert.equal(h.installs(), 0);
  h.autoUpdater.emit('update-downloaded', { version: '1.5.4' });
  h.ipcMain.emit('updater:install', foreign); assert.equal(h.installs(), 0);
  h.ipcMain.emit('updater:install', h.event); assert.equal(h.installs(), 1);
});

test('closing the application removes timers and listeners', t => {
  const h = harness(t); h.window.emit('closed');
  assert.equal(h.timers.size, 0); assert.equal(h.powerMonitor.listenerCount('resume'), 0);
  assert.equal(h.autoUpdater.listenerCount('download-progress'), 0);
  assert.equal(h.ipcMain.listenerCount('updater:check'), 0);
});

test('the COM updater supports older installed clients and exposes the restart action', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const callbacks = {}, cleanup = []; let checks = 0, installs = 0, state = null, effect, tree;
  const subscribe = name => fn => { callbacks[name] = fn; return () => cleanup.push(name); };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: {
    onUpdateStatus: subscribe('status'), onUpdateInfo: subscribe('info'), onUpdateProgress: subscribe('progress'),
    checkForUpdate: () => checks++, installUpdate: () => installs++,
  } } });
  const react = { useState: () => [state, value => { state = typeof value === 'function' ? value(state) : value; }], useEffect: fn => { effect = fn; } };
  const jsx = (type, props) => ({ type, props });
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/DesktopUpdateStatus.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : { jsx, jsxs: jsx }, mod, mod.exports);
  mod.exports.default(); const dispose = effect();
  t.after(() => { dispose(); if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  assert.equal(checks, 1, 'legacy clients are prompted to check when the controls open');
  callbacks.status('available'); callbacks.info({ version: '1.5.3' }); callbacks.progress({ percent: 60 });
  assert.equal(state.status, 'downloading'); assert.equal(state.percent, 60);
  callbacks.status('downloaded'); tree = mod.exports.default();
  const nodes = [];
  function walk(value) { if (Array.isArray(value)) return value.forEach(walk); if (!value || typeof value !== 'object') return; nodes.push(value); walk(value.props?.children); }
  walk(tree);
  nodes.find(node => node.type === 'button').props.onClick(); assert.equal(installs, 1);
});


test('startup page can retry but arbitrary local/data pages cannot invoke updates', async t => {
  const url = 'data:text/html;charset=utf-8,startup'; const h = harness(t, url);
  h.event.senderFrame.url = url;
  assert.ok(h.snapshot(h.event));
  h.ipcMain.emit('updater:check', h.event); await Promise.resolve(); assert.equal(h.checks(), 1);
  h.event.senderFrame.url = 'data:text/html,foreign'; assert.equal(h.snapshot(h.event), null);
  h.ipcMain.emit('updater:check', h.event); assert.equal(h.checks(), 1);
});
test('installation exception becomes a recoverable error instead of a main-process crash', t => {
  const h = harness(t); h.autoUpdater.emit('update-downloaded', { version: '1.5.7' }); h.failInstall();
  assert.equal(h.api.install(), false); assert.equal(h.api.getState().status, 'error');
});
