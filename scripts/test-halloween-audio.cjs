const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
test('Halloween audio schedules one loop, pauses in background and releases audio on departure', async () => {
 const saved = { document: global.document, AudioContext: global.AudioContext, setInterval: global.setInterval, clearInterval: global.clearInterval };
 const events = new Map(); let cleanup, loops = 0, cleared = 0, ctx, schedule;
 global.document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
 global.setInterval = fn => { loops++; schedule = fn; return 42; };
 global.clearInterval = id => { if (id === 42) cleared++; };
 global.AudioContext = class {
  state = 'suspended'; currentTime = 0; destination = {}; notes = 0;
  constructor() { ctx = this; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createOscillator() { this.notes++; return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {}, disconnect() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createDelay() { return { delayTime: {}, connect() {} }; }
 };
 try {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/components/HalloweenAmbience.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => ({ useEffect: fn => { cleanup = fn(); } }), m, m.exports);
  assert.equal(m.exports.default(), null); await Promise.resolve();
  assert.equal(loops, 1); assert.equal(ctx.notes, 20);
  schedule(); assert.equal(ctx.notes, 20);
  ctx.currentTime = 2; schedule(); assert.equal(ctx.notes, 40);
  await events.get('pointerdown')(); assert.equal(loops, 1);
  global.document.hidden = true; events.get('visibilitychange')(); assert.equal(ctx.state, 'suspended');
  schedule(); assert.equal(ctx.notes, 40);
  global.document.hidden = false; events.get('visibilitychange')(); await Promise.resolve(); assert.equal(ctx.state, 'running');
  // Advance through the musical arc. The drop must be fuller, then return to calm.
  const counts = [];
  for (let bar = 2; bar < 21; bar++) {
   const before = ctx.notes; ctx.currentTime = bar * 2.88 - 0.4; schedule(); counts[bar] = ctx.notes - before;
  }
  assert.ok(counts[7] > counts[2], 'the build adds rhythmic motion');
  assert.ok(counts[8] > counts[2], 'the drop adds bass, drums and a lower lead');
  assert.ok(counts[16] < counts[8], 'the reprise calms down');
  assert.equal(counts[20], 20, 'the next cycle returns to the original music-box texture');
  cleanup(); assert.equal(ctx.state, 'closed'); assert.equal(cleared, 1); assert.equal(events.size, 0);
 } finally { Object.assign(global, saved); }
});
