const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/radio-playback.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports);
test('Windows gain reaches 200% without invalid media volume; mute and cleanup affect every receiver', async t => {
  const original = global.AudioContext;
  const sources = [], gains = [], contexts = [];
  const node = () => ({ gain: { value: 1 }, connect() {}, disconnect() { this.disconnected = true; } });
  global.AudioContext = class {
    constructor() { contexts.push(this); }
    createMediaElementSource() { const n = node(); sources.push(n); return n; }
    createGain() { const n = node(); gains.push(n); return n; }
    async resume() { this.resumed = true; }
    async close() { this.closed = true; }
    async setSinkId(id) { this.sinkId = id; }
  };
  t.after(() => { if (original) global.AudioContext = original; else delete global.AudioContext; });
  const playback = new mod.exports.RadioPlayback(), a = {}, b = {};
  playback.attach(a, 2, true); playback.attach(b, 0.8, true);
  assert.equal(a.volume, 1); assert.equal(gains[0].gain.value, 2); assert.equal(gains[1].gain.value, 0.8);
  playback.setVolume(a, 0); assert.equal(gains[0].gain.value, 0);
  await playback.resume(); await playback.setSinkId('headset'); assert.equal(contexts[0].sinkId, 'headset');
  playback.detach(a); assert.equal(sources[0].disconnected, true);
  playback.close(); assert.equal(gains[1].disconnected, true); assert.equal(contexts[0].closed, true);
});
test('browser playback keeps its existing element path and clamps volume to 100%', () => {
  const playback = new mod.exports.RadioPlayback(), element = {};
  playback.attach(element, 0.8, false); assert.equal(element.volume, 0.8);
  playback.setVolume(element, 2); assert.equal(element.volume, 1);
  playback.setVolume(element, 0); assert.equal(element.volume, 0); playback.close();
});
