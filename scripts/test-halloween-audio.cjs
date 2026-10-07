const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
 const m = { exports: {} };
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name] ?? require(name), m, m.exports);
 return m.exports;
}
const score = load('src/lib/halloween-score.ts');
test('Halloween composition lasts three minutes with two contrasting organ drops', () => {
 assert.equal(score.HALLOWEEN_BAR_COUNT * 4 * score.HALLOWEEN_BEAT, 180);
 assert.equal(score.halloweenSection(16).drop, true);
 assert.equal(score.halloweenSection(48).drop, true);
 assert.ok(score.halloweenSection(16).volume >= score.halloweenSection(0).volume * 2);
 assert.equal(score.halloweenSection(32).drop, false);
 assert.ok(score.halloweenSection(63).volume < score.halloweenSection(48).volume);
});
test('Halloween audio schedules one loop, pauses in background and releases audio on departure', async () => {
 const saved = { document: global.document, AudioContext: global.AudioContext, setInterval: global.setInterval, clearInterval: global.clearInterval };
 const events = new Map(); let cleanup, loops = 0, cleared = 0, ctx, schedule;
 const sceneStyles = new Map();
 const scene = { dataset: {}, style: { setProperty: (name, value) => sceneStyles.set(name, value), removeProperty: name => sceneStyles.delete(name) } };
 global.document = { hidden: false, querySelector: () => scene, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
 global.setInterval = fn => { loops++; schedule = fn; return 42; };
 global.clearInterval = id => { if (id === 42) cleared++; };
 global.AudioContext = class {
  state = 'suspended'; currentTime = 0; destination = {}; notes = 0; sampleRate = 44100; organNotes = 0; drums = 0;
  constructor() { ctx = this; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createOscillator() { this.notes++; return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, setPeriodicWave: () => this.organNotes++, connect() {}, start() {}, stop() {}, disconnect() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createDelay() { return { delayTime: {}, connect() {} }; }
  createPeriodicWave() { return {}; }
  createBuffer() { return { getChannelData: () => new Float32Array(44100) }; }
  createBufferSource() { this.drums++; return { connect() {}, start() {}, stop() {}, disconnect() {} }; }
  createBiquadFilter() { return { frequency: {}, connect() {}, disconnect() {} }; }
  createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; }
 };
 try {
  const component = load('src/components/HalloweenAmbience.tsx', { react: { useEffect: fn => { cleanup = fn(); } }, '@/lib/halloween-score': score });
  assert.equal(component.default(), null); await Promise.resolve();
  assert.equal(loops, 1); assert.equal(ctx.notes, 20);
  schedule(); assert.equal(ctx.notes, 20);
  ctx.currentTime = 2; schedule(); assert.equal(ctx.notes, 40);
  await events.get('pointerdown')(); assert.equal(loops, 1);
  global.document.hidden = true; events.get('visibilitychange')(); assert.equal(ctx.state, 'suspended');
  assert.equal(scene.dataset.musicPlaying, 'false');
  schedule(); assert.equal(ctx.notes, 40);
  global.document.hidden = false; events.get('visibilitychange')(); await Promise.resolve(); assert.equal(ctx.state, 'running');
  // Advance through the musical arc. The drop must be fuller, then return to calm.
  const counts = [];
  for (let bar = 2; bar < 65; bar++) {
   const before = ctx.notes, organBefore = ctx.organNotes, drumsBefore = ctx.drums;
   ctx.currentTime = bar * score.HALLOWEEN_BEAT * 4 - 0.4; schedule(); counts[bar] = ctx.notes - before;
   if (bar === 16 || bar === 48) {
    assert.ok(ctx.organNotes > organBefore, 'the drop plays a sustained organ');
    assert.ok(ctx.drums > drumsBefore, 'the drop adds snare and cymbals');
    assert.notEqual(scene.dataset.musicPhase, 'drop', 'look-ahead must not trigger the visuals early');
    ctx.currentTime = bar * score.HALLOWEEN_BEAT * 4 + 0.01; schedule();
    assert.equal(scene.dataset.musicPhase, 'drop', 'visuals follow the audible drop');
    assert.ok(parseFloat(sceneStyles.get('--music-float-period')) < score.HALLOWEEN_BEAT * 20, 'floating speeds up with the drop');
   }
  }
  assert.ok(counts[15] > counts[2], 'the build adds rhythmic motion');
  assert.ok(counts[16] > counts[2], 'the drop adds organ, bass and drums');
  assert.ok(counts[32] < counts[16], 'the breakdown calms down');
  assert.equal(counts[64], 20, 'the next cycle returns to the original music-box texture');
  cleanup(); assert.equal(ctx.state, 'closed'); assert.equal(cleared, 1); assert.equal(events.size, 0);
  assert.deepEqual(scene.dataset, {});
  assert.equal(sceneStyles.size, 0);
 } finally { Object.assign(global, saved); }
});
