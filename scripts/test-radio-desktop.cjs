const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const ts = require('typescript');

function harness() {
  const children = [], states = [], timers = new Set();
  let configure, now = 0;
  const powerMonitor = new EventEmitter();
  const frame = { url: 'https://www.mixouairlinesptfsweblogbook.com/pilote' };
  const webContents = Object.assign(new EventEmitter(), { mainFrame: frame, send: (_channel, value) => states.push(value) });
  const window = Object.assign(new EventEmitter(), { webContents, isDestroyed: () => false });
  const electron = { app: { isPackaged: true }, powerMonitor, ipcMain: {
    handle: (_name, callback) => { configure = callback; }, removeHandler() {},
  } };
  const spawn = () => {
    const child = Object.assign(new EventEmitter(), { stdout: Object.assign(new EventEmitter(), { setEncoding() {} }), kill() { this.killed = true; } });
    children.push(child); queueMicrotask(() => child.emit('spawn')); return child;
  };
  const code = ts.transpileModule(fs.readFileSync('vhf-radio-app/electron/ptt.ts','utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require','module','exports','__dirname','process','setInterval','clearInterval','Date',code)(
    name => name === 'electron' ? electron : name === 'node:child_process' ? { spawn } : require(name),
    mod,mod.exports,'C:/test/electron',{platform:'win32',pid:123,resourcesPath:'C:/test/resources'},
    fn => { timers.add(fn); return fn; }, fn => timers.delete(fn), { now: () => now });
  mod.exports.installPtt(window);
  return { children, states, window, powerMonitor, configure: code => configure({sender:webContents,senderFrame:frame},code),
    foreign: () => configure({sender:webContents,senderFrame:{url:'https://evil.test'}},'Space'),
    advance: ms => { now += ms; [...timers].forEach(fn => fn()); } };
}

test('global PTT forwards down/up and OFF ignores late helper messages',async()=>{
  const h=harness(); assert.equal(await h.configure('Space'),true);
  const child=h.children[0]; child.stdout.emit('data','1\r\n'); assert.equal(h.states.at(-1),true);
  child.stdout.emit('data','0\n'); assert.equal(h.states.at(-1),false);
  child.stdout.emit('data','1\n'); await h.configure('');
  assert.equal(child.killed,true); assert.equal(h.states.at(-1),false);
  child.stdout.emit('data','1\n'); assert.equal(h.states.at(-1),false);
});
test('missing heartbeat, native exit and screen lock close PTT synchronously',async()=>{
  for(const failure of ['timeout','exit','lock']) {
    const h=harness(); await h.configure('ControlRight');
    h.children[0].stdout.emit('data','1\n');
    if(failure==='timeout')h.advance(600);
    if(failure==='exit')h.children[0].emit('exit');
    if(failure==='lock')h.powerMonitor.emit('lock-screen');
    assert.equal(h.states.at(-1),false); assert.equal(h.children[0].killed,true);
  }
});
test('untrusted frames, unsupported keys and malformed signals cannot arm global PTT',async()=>{
  const h=harness(); assert.equal(await h.foreign(),false);
  assert.equal(await h.configure('shell-command'),false); assert.equal(h.children.length,0);
  await h.configure('KeyV'); h.children[0].stdout.emit('data','invalid\n');
  assert.equal(h.children[0].killed,true); assert.equal(h.states.at(-1),false);
});
