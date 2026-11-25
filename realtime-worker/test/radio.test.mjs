import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker, { RadioRoom } from '../src/worker.mjs';
import { verifyTicket } from '../src/ticket.mjs';

const secret = 'test-only-secret-at-least-32-characters';
const now = Math.floor(Date.now() / 1000);
function ticket(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ aud: 'weblogbook-radio', sub: 'user-1', name: 'DLH123', room: 'vhf-118935',
    iat: now, exp: now + 60, jti: 'abcdefghijklmnop', ...overrides })).toString('base64url');
  return `${header}.${body}.${createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
}
test('tickets are signed, room-bound, short-lived and audience checked', async () => {
  assert.equal((await verifyTicket(ticket(), secret)).room, 'vhf-118935');
  for (const invalid of [ticket({ exp: now - 1 }), ticket({ exp: now + 3600 }), ticket({ aud: 'other' }), ticket({ room: '../private' }), ticket().slice(0, -4) + 'AAAA']) {
    await assert.rejects(verifyTicket(invalid, secret));
  }
  await assert.rejects(verifyTicket(ticket(), 'different-secret-at-least-32-characters'));
});
test('worker refuses unknown origins and unsigned upgrades before allocating rooms', async () => {
  const env = { ALLOWED_ORIGINS: 'https://site.test', REALTIME_TICKET_SECRET: secret,
    ROOMS: { get() { throw new Error('Must not allocate'); } } };
  const response = await worker.fetch(new Request('https://radio.test/connect', { headers: { Upgrade: 'websocket', Origin: 'https://attacker.test' } }), env);
  assert.equal(response.status, 403);
  const unsigned = await worker.fetch(new Request('https://radio.test/connect', { headers: { Upgrade: 'websocket', Origin: 'https://site.test' } }), env);
  assert.equal(unsigned.status, 401);
});
function harness() {
  const sockets = [];
  const storage = new Map();
  const ctx = { getWebSockets: () => sockets, storage: { get: async k => storage.get(k), put: async (k,v) => storage.set(k,v), setAlarm: async () => {},
    list: async () => storage, delete: async k => storage.delete(k) } };
  const room = new RadioRoom(ctx, { SFU_APP_ID: 'app', SFU_APP_SECRET: 'server-only', TURN_KEY_ID: 'key', TURN_API_TOKEN: 'turn-server-only' });
  const calls = [];
  room.provider = async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith('sessions/new')) return { sessionId: `session-${calls.length}` };
    if (path.endsWith('tracks/new')) return { sessionDescription: { type: body.sessionDescription ? 'answer' : 'offer', sdp: 'test-sdp' },
      tracks: body.tracks.map((t,i) => ({ ...t, mid: String(i) })) };
    return {};
  };
  function member(id, published = false) {
    let state = { canPublish: true, id, identity: id, name: id, hello: true, published, pubSession: published ? `publisher-${id}` : null,
      pubMid: published ? '0' : null, subSession: null, subscriptions: {}, pending: false, closed: false, minute: Date.now(), count: 0 };
    const ws = { deserializeAttachment: () => structuredClone(state), serializeAttachment: s => { state = structuredClone(s); },
      sent: [], send(message) { this.sent.push(JSON.parse(message)); }, close() { this.closed = true; } };
    sockets.push(ws); return ws;
  }
  let request = 0;
  async function send(ws, action, payload) { await room.webSocketMessage(ws, JSON.stringify({ id: ++request, action, payload })); return ws.sent.findLast(m => m.id === request); }
  return { room, member, send, calls };
}
test('unavailable tracks preserve working subscriptions and can be retried', async () => {
  const h = harness(), receiver = h.member('receiver');
  h.member('healthy', true); h.member('silent', true);
  const original = h.room.provider;
  let unavailable = true;
  h.room.provider = async (path, body, ...args) => {
    const result = await original(path, body, ...args);
    if (unavailable && path.endsWith('tracks/new')) {
      result.tracks = result.tracks.map(t => t.trackName === 'silent'
        ? { sessionId: t.sessionId, trackName: t.trackName, errorCode: 'empty_track_error' } : t);
    }
    return result;
  };
  const first = await h.send(receiver, 'subscribe', { peers: ['healthy', 'silent'] });
  assert.deepEqual(first.result.tracks, [{ peerId: 'healthy', mid: '0' }]);
  assert.equal(h.room.state(receiver).closed, false);
  await h.send(receiver, 'answer', { sessionDescription: { type: 'answer', sdp: 'answer' } });
  unavailable = false;
  const retry = await h.send(receiver, 'subscribe', { peers: ['healthy', 'silent'] });
  assert.deepEqual(retry.result.tracks.map(t => t.peerId), ['silent']);
  assert.equal(h.calls.filter(c => c.path.endsWith('sessions/new')).length, 1);
});
test('subscription provider retains per-track errors but rejects top-level errors', async () => {
  const h = harness(), originalFetch = globalThis.fetch;
  const result = { tracks: [{ errorCode: 'empty_track_error' }] };
  try {
    globalThis.fetch = async () => Response.json(result);
    assert.deepEqual(await RadioRoom.prototype.provider.call(h.room, 'tracks/new', {}, 'POST', false, true), result);
    globalThis.fetch = async () => Response.json({ errorCode: 'invalid_params', errorDescription: 'private data' });
    await assert.rejects(RadioRoom.prototype.provider.call(h.room, 'tracks/new', {}, 'POST', false, true),
      { message: 'Cloudflare negotiation refused (invalid_params)' });
  } finally { globalThis.fetch = originalFetch; }
});
test('all unavailable tracks without an offer keep the station connected', async () => {
  const h = harness(), receiver = h.member('receiver'); h.member('gone', true);
  const original = h.room.provider;
  h.room.provider = async (path, body) => path.endsWith('tracks/new')
    ? { tracks: body.tracks.map(t => ({ ...t, errorCode: 'not_found_track_error' })) }
    : original(path, body);
  const reply = await h.send(receiver, 'subscribe', { peers: ['gone'] });
  assert.deepEqual(reply.result, { tracks: [] });
  assert.equal(h.room.state(receiver).pending, false);
  assert.equal(h.room.state(receiver).closed, false);
  assert.deepEqual((await h.send(receiver, 'ping')).result, {});
});
test('subscriptions resolve only participants inside the authenticated room', async () => {
  const h = harness(), receiver = h.member('receiver');
  h.member('allowed', true);
  const reply = await h.send(receiver, 'subscribe', { peers: ['allowed', 'foreign-session'], sessionId: 'stolen' });
  const request = h.calls.find(c => c.path.endsWith('tracks/new'));
  assert.deepEqual(request.body.tracks, [{ location: 'remote', sessionId: 'publisher-allowed', trackName: 'allowed' }]);
  assert.equal(reply.result.tracks[0].peerId, 'allowed');
  assert.ok(!JSON.stringify(reply).includes('publisher-allowed'), 'SFU session locators remain private');
});
test('subscriber mutations wait for the complete SDP answer exchange', async () => {
  const h = harness(), receiver = h.member('receiver'); h.member('pilot', true);
  await h.send(receiver, 'subscribe', { peers: ['pilot'] });
  assert.equal(h.room.state(receiver).pending, true);
  await h.send(receiver, 'answer', { sessionDescription: { type: 'answer', sdp: 'answer' } });
  assert.equal(h.room.state(receiver).pending, false);
  await h.send(receiver, 'unsubscribe', { peers: ['pilot'] });
  assert.deepEqual(h.room.state(receiver).subscriptions, {});
  assert.equal(h.calls.at(-1).body.force, true);
});
test('overlapping negotiation fails closed and withdraws room membership', async () => {
  const h = harness(), receiver = h.member('receiver'); h.member('pilot', true);
  await h.send(receiver, 'subscribe', { peers: ['pilot'] });
  const response = await h.send(receiver, 'subscribe', { peers: ['pilot'] });
  assert.ok(response.error);
  assert.equal(h.room.state(receiver).closed, true);
  assert.equal(receiver.closed, true);
});
test('video/data publication is refused and disconnect cleans both SFU sessions', async () => {
  const h = harness(), invalid = h.member('invalid');
  const response = await h.send(invalid, 'publish', { mid: '0', sessionDescription: { type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96' } });
  assert.ok(response.error);
  assert.equal(h.calls.length, 0);
  const receiver = h.member('receiver', true); h.member('pilot', true);
  await h.send(receiver, 'subscribe', { peers: ['pilot'] });
  await h.send(receiver, 'answer', { sessionDescription: { type: 'answer', sdp: 'answer' } });
  await h.room.webSocketClose(receiver);
  assert.equal(h.calls.filter(c => c.path.endsWith('tracks/close')).length, 2);
});
test('50 members retain independent SFU session ownership after hibernation', async () => {
  const h = harness();
  const sockets = Array.from({ length: 50 }, (_, i) => h.member(`pilot-${i}`, true));
  const restored = new RadioRoom(h.room.ctx, h.room.env);
  assert.equal(restored.peers(sockets[0]).length, 49);
  assert.equal(restored.state(sockets[25]).pubSession, 'publisher-pilot-25');
  assert.equal(restored.peers(sockets[0]).some(p => 'pubSession' in p), false);
});
test('per-track SFU errors in an HTTP 200 response are rejected', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ tracks: [{ errorCode: 'TRACK_NOT_FOUND' }] });
  try {
    const room = new RadioRoom({}, { SFU_APP_SECRET: 'secret' });
    await assert.rejects(room.provider('test', {}), /negotiation refused/);
  } finally { globalThis.fetch = original; }
});

test('publisher and subscriber session requests have no body while track and TURN requests retain JSON', async () => {
  const original = globalThis.fetch;
  const requests = [];
  let sessions = 0;
  globalThis.fetch = async (url, options) => {
    const request = new Request(url, options);
    requests.push(request);
    assert.equal(request.method, 'POST');
    if (url.endsWith('/sessions/new')) {
      assert.equal(request.body, null, 'Cloudflare rejects {} for body-less session creation');
      assert.equal(await request.text(), '');
      assert.equal(request.headers.get('Authorization'), 'Bearer server-only');
      return Response.json({ sessionId: `session-${++sessions}` });
    }
    const body = await request.json();
    if (url.endsWith('/generate-ice-servers')) {
      assert.equal(request.headers.get('Authorization'), 'Bearer turn-server-only');
      assert.deepEqual(body, { ttl: 86400 });
      return Response.json({ iceServers: [{ urls: ['turn:example.test'] }] });
    }
    assert.ok(url.endsWith('/tracks/new'));
    assert.equal(body.tracks.length, 1);
    return Response.json({ sessionDescription: { type: body.sessionDescription ? 'answer' : 'offer', sdp: 'test-sdp' },
      tracks: body.tracks.map((track, i) => ({ ...track, mid: String(i) })) });
  };
  try {
    const h = harness();
    h.room.provider = RadioRoom.prototype.provider;
    const publisher = h.member('local-pilot');
    const published = await h.send(publisher, 'publish', { mid: '0', sessionDescription: { type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111' } });
    assert.equal(published.result.sessionDescription.type, 'answer');
    await h.send(publisher, 'published');
    const receiver = h.member('listener');
    const subscribed = await h.send(receiver, 'subscribe', { peers: ['local-pilot'] });
    assert.equal(subscribed.result.sessionDescription.type, 'offer');
    assert.equal(sessions, 2);
    const joining = h.member('new-listener');
    const state = h.room.state(joining); state.hello = false; h.room.save(joining, state);
    const hello = await h.send(joining, 'hello');
    assert.equal(hello.result.iceServers.length, 1);
    assert.equal(requests.length, 5);
  } finally { globalThis.fetch = original; }
});

test('server rejects OBS publication before contacting SFU but still allows reception',async()=>{
  const h=harness(), obs=h.member('observer');
  const state=h.room.state(obs); state.canPublish=false; h.room.save(obs,state);
  h.member('controller',true);
  const received=await h.send(obs,'subscribe',{peers:['controller']});
  assert.equal(received.result.tracks[0].peerId,'controller');
  const before=h.calls.length;
  const reply=await h.send(obs,'publish',{mid:'0',sessionDescription:{type:'offer',sdp:'m=audio 9 test'}});
  assert.match(reply.error,/OBS/);
  assert.ok(!h.calls.slice(before).some(c=>c.path.endsWith('sessions/new')));
});

