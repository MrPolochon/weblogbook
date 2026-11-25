const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}, env = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(env), code)(n => deps[n] || require(n), mod, mod.exports, ...Object.values(env));
  return mod.exports;
}
const { groundIdleClock, GROUND_IDLE_MS } = load('src/lib/ground/inactivity.ts');
function storage() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; }
test('one hour deadline survives refresh, background polls and sleep; expired activity cannot revive it', () => {
  const store = storage(); let time = 10000;
  const a = groundIdleClock(store, 'duty-a', () => time);
  time += GROUND_IDLE_MS - 1; assert.equal(a.check(), false);
  const refresh = groundIdleClock(store, 'duty-a', () => time);
  time++; assert.equal(refresh.check(), true); assert.equal(a.activity(), false);
  assert.equal(groundIdleClock(store, 'new-duty', () => time).check(), false);
});
test('activity in one tab keeps all tabs on the same duty active; expiry propagates', () => {
  const store = storage(); let time = 10000;
  const a = groundIdleClock(store, 'duty', () => time), b = groundIdleClock(store, 'duty', () => time);
  time += 50 * 60000; a.activity(); time += 20 * 60000;
  assert.equal(b.check(), false); time += 40 * 60000;
  assert.equal(b.check(), true); assert.equal(a.check(), true);
});
test('unavailable storage still enforces the local deadline', () => {
  let time = 10000; const clock = groundIdleClock({ getItem() { throw Error(); }, setItem() { throw Error(); } }, 'duty', () => time);
  time += GROUND_IDLE_MS; assert.equal(clock.check(), true);
});
test('guard unmounts radio immediately offline, retries closure and counts native PTT activity', async () => {
  let time = 10000, cursor = 0, effect, tick, ptt, fail = true;
  const states = [], requests = [], events = new Map();
  const react = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = v; }]; }, useEffect(fn) { effect = fn; } };
  const jsx = (type, props) => ({ type, props });
  const target = { addEventListener: (k,v) => events.set(k,v), removeEventListener: k => events.delete(k) };
  const Guard = load('src/components/GroundInactivityGuard.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/ground/inactivity': { groundIdleClock: (s,k) => groundIdleClock(s,k,() => time) },
    '@/lib/radio-desktop': { radioDesktop: () => ({ onPtt: fn => { ptt = fn; return () => { ptt = null; }; } }) },
  }, { window: { ...target, localStorage: storage() }, document: target,
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => {},
    fetch: async (url, options) => { requests.push({url,options}); return { ok: !fail }; },
  }).default;
  const render = () => { cursor = 0; return Guard({ userId: 'u', sessionId: 'session-a', children: 'radio-and-dashboard' }); };
  assert.equal(render().props.children, 'radio-and-dashboard'); const cleanup = effect();
  time += 50 * 60000; ptt(true); time += 20 * 60000; tick(); assert.equal(requests.length, 0);
  time += 40 * 60000; tick(); await Promise.resolve(); await Promise.resolve();
  assert.equal(render().type, 'section'); assert.equal(states[2], true); assert.equal(requests.length, 1);
  assert.match(requests[0].url, /sessionId=session-a/); assert.equal(requests[0].options.method, 'DELETE');
  fail = false; tick(); await Promise.resolve(); await Promise.resolve(); assert.equal(states[1], true);
  tick(); assert.equal(requests.length, 2); cleanup(); assert.equal(ptt, null);
});

const sessionId = '11111111-1111-4111-8111-111111111111';
function route({ user = 'owner', match = true, error = false } = {}) {
  const filters = [], deleted = []; let leaving = 0, deleting = false;
  const builder = { select() { return this; }, eq(k,v) { filters.push([k,v]); return this; },
    delete() { deleting = true; return this; }, async maybeSingle() {
      if (deleting) { deleted.push(...filters); return { data: error ? null : { id: sessionId }, error: error ? {} : null }; }
      return { data: match ? { id: sessionId, aeroport: 'IRFD' } : null };
    } };
  const api = load('src/app/api/ground/session/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => builder }) },
    '@/lib/ground/teams': { getActiveTeam: async () => { leaving++; return null; } },
  });
  return { ...api, filters, deleted, leaving: () => leaving };
}
test('automatic service deletion is authenticated, owner scoped and session scoped', async () => {
  const h = route(); const res = await h.DELETE(new Request('https://site/api/ground/session?sessionId=' + sessionId));
  assert.equal(res.status, 200); assert.ok(h.deleted.some(([k,v]) => k === 'user_id' && v === 'owner'));
  assert.ok(h.deleted.some(([k,v]) => k === 'id' && v === sessionId)); assert.equal(h.leaving(), 1);
  const anonymous = route({ user: null }); assert.equal((await anonymous.DELETE(new Request('https://site/api/ground/session'))).status, 401);
});
test('a stale tab cannot close a newer session and database errors are retryable', async () => {
  const h = route({ match: false }); assert.equal((await h.DELETE(new Request('https://site/api/ground/session?sessionId=' + sessionId))).status, 200);
  assert.equal(h.deleted.length, 0); assert.equal(h.leaving(), 0);
  const failed = route({ error: true }); assert.equal((await failed.DELETE(new Request('https://site/api/ground/session'))).status, 500); assert.equal(failed.leaving(), 0);
});
