const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const { RadioTransmission } = load('src/lib/radio-transmission.ts');
const frequencies = load('src/lib/vhf-frequencies.ts');

test('cockpit stays private until a ready PTT is held; multiple input sources release independently', () => {
  const changes = [];
  const gate = new RadioTransmission(value => changes.push(value));
  gate.setMode('ptt');
  gate.press('keyboard');
  assert.equal(gate.transmitting, false);
  gate.setReady(true);
  assert.equal(gate.transmitting, false, 'early key presses must not be queued across mic permission');
  gate.press('keyboard');
  gate.press('pointer-1');
  gate.release('keyboard');
  assert.equal(gate.transmitting, true);
  gate.release('pointer-1');
  assert.equal(changes.at(-1), false);
});

test('blur clears held PTT but leaves explicitly chosen open mic; disconnect always closes it', () => {
  const gate = new RadioTransmission(() => {});
  gate.setReady(true);
  gate.setMode('ptt');
  gate.press('keyboard');
  gate.releaseAll();
  assert.equal(gate.transmitting, false);
  gate.setMode('open');
  gate.releaseAll();
  assert.equal(gate.transmitting, true);
  gate.reset();
  gate.setReady(true);
  assert.equal(gate.transmitting, false);
  assert.equal(gate.mode, 'muted');
});

function hookHarness() {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const react = {
    useRef: initial => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const rooms = [];
  class Room {
    state = 'disconnected'; remoteParticipants = new Map(); handlers = {}; published = [];
    localParticipant = {
      publishTrack: async track => { this.published.push(track); },
      unpublishTrack: async () => {},
    };
    constructor() { rooms.push(this); }
    on(name, callback) { this.handlers[name] = callback; }
    removeAllListeners() { this.handlers = {}; }
    async connect() { this.state = 'connected'; }
    async disconnect() { this.state = 'disconnected'; }
    async startAudio() {}
  }
  class LocalAudioTrack {
    constructor(track) { this.mediaStreamTrack = track; }
    stop() { this.mediaStreamTrack.stop(); }
  }
  const { useVhfRadio } = load('src/hooks/useVhfRadio.ts', {
    react,
    '@/lib/cloudflare/client': { Room, LocalAudioTrack, AudioPresets: { speech: {} }, Track: { Source: { Microphone: 'microphone' }, Kind: { Audio: 'audio' } },
      ConnectionState: { Connected: 'connected', Disconnected: 'disconnected', Connecting: 'connecting' },
      RoomEvent: Object.fromEntries(['ParticipantConnected', 'ParticipantDisconnected', 'ActiveSpeakersChanged', 'ConnectionStateChanged', 'Disconnected', 'TrackSubscribed', 'TrackUnsubscribed', 'AudioPlaybackStatusChanged'].map(x => [x, x])) },
    '@/lib/vhf-frequencies': frequencies,
    '@/lib/radio-transmission': { RadioTransmission },
  });
  return { rooms, render() { cursor = 0; return useVhfRadio('DLH123'); } };
}

async function withMedia(run) {
  const originals = Object.fromEntries(['fetch', 'navigator', 'AudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const requests = [];
  const gains = [];
  const captures = [];
  let resolveCapture;
  let delayCapture = false;
  global.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ token: 'test', url: 'wss://test' }); };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => {
    const track = { stopped: false, stop() { this.stopped = true; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    captures.push(track);
    return delayCapture ? new Promise(resolve => { resolveCapture = () => resolve(stream); }) : Promise.resolve(stream);
  } } } });
  global.AudioContext = class {
    currentTime = 0; state = 'running';
    async resume() {} async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect: node => node, disconnect() {} }; }
    createGain() { const gain = { value: 1, setValueAtTime(value) { this.value = value; } }; gains.push(gain); return { gain, connect() {}, disconnect() {} }; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ stop() {} }] } }; }
  };
  try { await run({ requests, gains, captures, delay() { delayCapture = true; }, resolve() { resolveCapture(); } }); }
  finally { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key]; } }
}

test('joining uses the same VHF room as desktop/mobile, with no microphone request', async () => withMedia(async media => {
  const harness = hookHarness();
  const radio = harness.render();
  await radio.connect('118.935');
  assert.equal(media.requests[0].roomName, 'vhf-118935');
  assert.equal(media.captures.length, 0);
  radio.disconnect();
}));

test('published stream is silent before PTT and closes synchronously on release, retune, or reconnect', async () => withMedia(async media => {
  const harness = hookHarness();
  const radio = harness.render();
  await radio.connect('118.935');
  await radio.setMicMode('ptt');
  assert.equal(media.gains[0].value, 0);
  radio.press('pointer-1');
  assert.equal(media.gains[0].value, 1);
  radio.release('pointer-1');
  assert.equal(media.gains[0].value, 0);
  await radio.setMicMode('open');
  assert.equal(media.gains[0].value, 1);
  harness.rooms[0].handlers.ConnectionStateChanged('reconnecting');
  assert.equal(media.gains[0].value, 0);
  assert.equal(media.captures[0].stopped, true);
  await radio.connect('121.500');
  assert.equal(harness.render().mode, 'muted');
  radio.disconnect();
}));

test('permission granted after cancellation never publishes or reopens microphone', async () => withMedia(async media => {
  const harness = hookHarness();
  const radio = harness.render();
  await radio.connect('118.935');
  media.delay();
  const activation = radio.setMicMode('open');
  await new Promise(resolve => setImmediate(resolve));
  await radio.setMicMode('muted');
  media.resolve();
  await activation;
  assert.equal(media.captures[0].stopped, true);
  assert.equal(harness.rooms[0].published.length, 0);
  assert.equal(harness.render().transmitting, false);
  radio.disconnect();
}));
