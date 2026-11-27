const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function client(fetch) {
  const values = [];
  const effects = [];
  const timeouts = new Map(); let timerId = 0;
  const exports = {};
  const react = {
    useCallback: fn => fn,
    useRef: value => ({ current: value }),
    useState: value => { const index = values.push(value) - 1; return [value, next => { values[index] = next; }]; },
    useEffect: fn => { effects.push(fn); },
  };
  const source = ts.transpileModule(fs.readFileSync('src/hooks/useCpdlc.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert.equal(name, 'react'); return react; }, fetch, AbortController,
    setTimeout: fn => { timeouts.set(++timerId, fn); return timerId; }, clearTimeout: id => timeouts.delete(id), setInterval: () => 1, clearInterval: () => {} });
  return { hook: exports.useCpdlc('plan'), values, effects, timeouts };
}
const ok = value => ({ ok: true, json: async () => value });
const command = requestId => ({ action: 'free_text', plan_id: 'plan', flight_no: 'DLH324', to: 'IRFD', text: 'TEST', client_request_id: requestId });

test('lost response retries preserve message identity, successful next send has a new identity', async () => {
  const posted = [];
  const c = client(async (_url, options) => {
    if (options.method !== 'POST') return ok({ available: true, messages: [] });
    posted.push(JSON.parse(options.body));
    if (posted.length === 1) throw new Error('connection dropped');
    return ok({ ok: true });
  });
  await assert.rejects(c.hook.act(command('first')), /connection dropped/);
  await c.hook.act(command('retry'));
  await c.hook.act(command('new'));
  assert.deepEqual(posted.map(item => item.client_request_id), ['first', 'first', 'new']);
});

test('double click cannot create concurrent transmissions', async () => {
  let finish;
  const c = client(async (_url, options) => options.method === 'POST' ? new Promise(resolve => { finish = resolve; }) : ok({ available: true, messages: [] }));
  const first = c.hook.act(command('first'));
  await assert.rejects(c.hook.act(command('second')), /TRANSMISSION IN PROGRESS/);
  finish(ok({ ok: true })); await first;
});

test('poll failures preserve inbox and report connection timeout', async () => {
  const inbox = { available: true, messages: [{ id: 'unread' }] }; let fail = false;
  const c = client(async (_url, options) => {
    if (!fail) return ok(inbox);
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  await c.hook.refresh(); fail = true;
  const pending = c.hook.refresh();
  [...c.timeouts.values()].forEach(fn => fn());
  await pending;
  assert.equal(c.values[0], inbox);
  assert.match(c.values[1], /CONNECTION TIMEOUT/);
});

function alarm(locks, allowed = true) {
  const effects = []; const timers = new Map(); const values = []; let timerId = 0;
  const stats = { played: 0, paused: 0, allowed }; const exports = {}; let controls;
  const source = ts.transpileModule(fs.readFileSync('src/components/cpdlc/useCpdlcAlarm.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, AbortController, navigator: { locks },
    require: () => ({ useRef: value => ({ current: value }), useState: value => { const index = values.push(value) - 1; return [value, next => { values[index] = next; }]; }, useEffect: fn => effects.push(fn) }),
    Audio: class { currentTime = 0; play() { stats.played++; return stats.allowed ? Promise.resolve() : Promise.reject(new Error('autoplay blocked')); } pause() { stats.paused++; } },
    setInterval: (fn, delay) => { assert.equal(delay, 3000); timers.set(++timerId, fn); return timerId; }, clearInterval: id => timers.delete(id),
    window: { addEventListener() {}, removeEventListener() {} },
  });
  const mount = () => { controls = exports.useCpdlcAlarm(true); const cleanups = effects.splice(0).map(fn => fn()); return () => cleanups.forEach(fn => fn?.()); };
  return { mount, stats, timers, values, enable: () => controls.enable() };
}

test('reception sound repeats every three seconds with one loop and stops after final ACK', async () => {
  const a = alarm(); const firstAck = a.mount(); const secondAck = a.mount();
  assert.equal(a.stats.played, 1); assert.equal(a.timers.size, 1);
  [...a.timers.values()].forEach(fn => fn()); assert.equal(a.stats.played, 2);
  firstAck(); assert.equal(a.timers.size, 1);
  secondAck(); assert.equal(a.timers.size, 0); assert.equal(a.stats.paused, 1);
});

function sharedLocks() {
  let held = false; const waiting = [];
  return { request(_name, { signal }, callback) {
    return new Promise((resolve, reject) => {
      const start = async () => { if (signal.aborted) { reject(new Error('aborted')); return; } held = true; await callback(); held = false; resolve(); waiting.shift()?.(); };
      if (held) waiting.push(start); else void start();
    });
  } };
}
test('browser tabs share one sound owner and transfer it when acknowledged', async () => {
  const locks = sharedLocks();
  const first = alarm(locks); const second = alarm(locks);
  const ackFirst = first.mount(); const ackSecond = second.mount();
  assert.equal(first.stats.played, 1); assert.equal(second.stats.played, 0);
  ackFirst(); await new Promise(setImmediate);
  assert.equal(first.timers.size, 0); assert.equal(second.stats.played, 1);
  ackSecond(); await Promise.resolve(); assert.equal(second.timers.size, 0);
});

test('autoplay-blocked leader releases ownership so another tab can enable sound', async () => {
  const locks = sharedLocks(); const first = alarm(locks, false); const second = alarm(locks, false);
  const ackFirst = first.mount(); const ackSecond = second.mount();
  await new Promise(setImmediate);
  assert.equal(first.timers.size, 0); assert.equal(second.timers.size, 0);
  assert.equal(first.values[0], true); assert.equal(second.values[0], true);
  second.stats.allowed = true; await second.enable(); await new Promise(setImmediate);
  assert.equal(first.timers.size, 0); assert.equal(second.timers.size, 1);
  assert.equal(second.values[0], false); assert.equal(second.stats.played, 2);
  [...second.timers.values()].forEach(fn => fn()); assert.equal(second.stats.played, 3);
  ackFirst(); ackSecond(); await new Promise(setImmediate);
  assert.equal(second.timers.size, 0);
});
