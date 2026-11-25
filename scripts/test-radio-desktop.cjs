const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const ts = require('typescript');
const keyModule = { exports: {} };
new Function('module','exports',ts.transpileModule(fs.readFileSync('vhf-radio-app/electron/ptt-keys.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText)(keyModule,keyModule.exports);

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
  const spawn = (_executable, args) => {
    const child = Object.assign(new EventEmitter(), { stdout: Object.assign(new EventEmitter(), { setEncoding() {} }), kill() { this.killed = true; } });
    child.args = args; children.push(child); queueMicrotask(() => child.emit('spawn')); return child;
  };
  const code = ts.transpileModule(fs.readFileSync('vhf-radio-app/electron/ptt.ts','utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require','module','exports','__dirname','process','setInterval','clearInterval','Date',code)(
    name => name === './ptt-keys' ? keyModule.exports : name === 'electron' ? electron : name === 'node:child_process' ? { spawn } : require(name),
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

test('custom keys use physical letter positions and support function, modifier and keypad keys',async()=>{
  const h=harness();
  for (const [code,arg] of [['KeyQ','scan:16'],['Digit1','scan:2'],['F12','123'],['F24','135'],['ShiftRight','161'],['Numpad8','104'],['IntlBackslash','scan:86']]) {
    assert.equal(await h.configure(code),true,code);
    assert.equal(h.children.at(-1).args[0],arg);
  }
  assert.equal(await h.configure('Escape'),false);
  assert.equal(await h.configure('MetaLeft'),false);
  assert.equal(await h.configure('__proto__'),false);
});

test('reported B F G T Y U O P keys all arm native PTT and forward press/release',async()=>{
  const h=harness();
  for(const [letter,scan] of Object.entries({B:48,F:33,G:34,T:20,Y:21,U:22,O:24,P:25})){
    assert.equal(await h.configure('Key'+letter),true,letter);
    const child=h.children.at(-1);
    assert.equal(child.args[0],'scan:'+scan);
    child.stdout.emit('data','1\n'); assert.equal(h.states.at(-1),true,letter+' down');
    child.stdout.emit('data','0\n'); assert.equal(h.states.at(-1),false,letter+' up');
  }
});
