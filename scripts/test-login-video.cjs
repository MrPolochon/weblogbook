const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

async function harness({ reduced = false, delayed = false } = {}) {
  let effect, options, resolveApi, destroyed = 0, muted = true, playing = 0, refs = 0;
  const listeners = new Map();
  const react = { useRef: value => ({ current: refs++ === 0 ? { appendChild() {} } : value }), useState: value => [value, () => {}], useCallback: fn => fn, useEffect: fn => { effect = fn; } };
  const jsx = (type, props) => ({ type, props });
  const player = { playVideo() { playing++; }, pauseVideo() {}, mute() { muted = true; }, unMute() { muted = false; }, setVolume() {}, destroy() { destroyed++; }, getIframe: () => ({}) };
  const api = { Player: function(_mount, opts) { options = opts; return player; } };
  const promise = delayed ? new Promise(r => { resolveApi = r; }) : Promise.resolve(api);
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/youtube-player': { loadYoutubePlayer: () => promise } };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/LoginChristmasVideo.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require','module','exports','window','document','Element',code)(n => deps[n], mod, mod.exports,
    { matchMedia: () => ({ matches: reduced }), location: { origin: 'https://site.test' } },
    { createElement: () => ({}), addEventListener: (k,v) => listeners.set(k,v), removeEventListener: k => listeners.delete(k) }, class Element {});
  mod.exports.default(); const dispose = effect(); await Promise.resolve();
  return { ready: () => options.events.onReady({ target: player }), click: () => listeners.get('click')({ isTrusted: true }),
    options: () => options, playing: () => playing, muted: () => muted, destroyed: () => destroyed,
    dispose, listeners, resolve: async () => { resolveApi(api); await Promise.resolve(); } };
}
test('first page interaction enables music once; later clicks never pause and ending repeats the same video', async () => {
  const h = await harness(); h.ready(); assert.equal(h.muted(), true);
  h.click(); assert.equal(h.muted(), false); const count = h.playing(); h.click(); assert.equal(h.playing(), count);
  assert.equal(h.options().playerVars.playlist, 'vf4ZXBzbAio'); assert.equal(h.options().playerVars.loop, 1);
  h.options().events.onStateChange({ data: 0 }); assert.equal(h.playing(), count + 1);
  h.dispose(); assert.equal(h.destroyed(), 1); assert.equal(h.listeners.size, 0);
});
test('early click is remembered, while leaving login before API load creates no player', async () => {
  const h = await harness({ delayed: true }); h.click(); await h.resolve(); h.ready(); assert.equal(h.muted(), false); h.dispose();
  const gone = await harness({ delayed: true }); gone.dispose(); await gone.resolve(); assert.equal(gone.options(), undefined);
});
test('reduced motion waits for interaction and blocked autoplay can retry on the next click', async () => {
  const h = await harness({ reduced: true }); h.ready(); assert.equal(h.playing(), 0);
  h.click(); h.options().events.onAutoplayBlocked(); assert.equal(h.muted(), true);
  h.click(); assert.equal(h.muted(), false); h.dispose();
});
test('YouTube CSP permissions are restricted to the login route', async () => {
  const config = (await import('../next.config.mjs')).default;
  const headers = await config.headers();
  const csp = row => row.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp(headers.find(h => h.source === '/login')), /https:\/\/www.youtube-nocookie.com/);
  assert.doesNotMatch(csp(headers.find(h => h.source.includes('(?!docs/'))), /youtube/);
});
