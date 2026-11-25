import { verifyTicket, ticketFromRequest } from './ticket.mjs';

const base = 'https://rtc.live.cloudflare.com/v1';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/health') return json({ service: 'weblogbook-radio', protocol: 1 });
    if (new URL(request.url).pathname !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 400);
    // Native apps have no Origin; browser origins must be explicitly configured.
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin refused' }, 403);
    try {
      const claims = await verifyTicket(ticketFromRequest(request), env.REALTIME_TICKET_SECRET);
      const room = env.ROOMS.get(env.ROOMS.idFromName(claims.room));
      return await room.fetch(request);
    } catch { return json({ error: 'Invalid or expired ticket' }, 401); }
  },
};

export class RadioRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queues = new Map();
    this.queued = new Map();
  }
  state(ws) { return ws.deserializeAttachment(); }
  save(ws, state) { ws.serializeAttachment(state); }
  members() { return this.ctx.getWebSockets().filter(ws => !this.state(ws)?.closed); }
  peers(except) {
    return this.members().filter(ws => ws !== except).map(ws => {
      const p = this.state(ws);
      return { id: p.id, identity: p.identity, name: p.name, published: p.published };
    });
  }
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch { /* close event performs cleanup */ } }
  broadcast() { for (const ws of this.members()) this.send(ws, { event: 'peers', peers: this.peers(ws) }); }
  async fetch(request) {
    let claims;
    try { claims = await verifyTicket(ticketFromRequest(request), this.env.REALTIME_TICKET_SECRET); }
    catch { return json({ error: 'Invalid ticket' }, 401); }
    if (!this.env.SFU_APP_ID || !this.env.SFU_APP_SECRET || !this.env.TURN_KEY_ID || !this.env.TURN_API_TOKEN) return json({ error: 'Service not configured' }, 503);
    return this.ctx.blockConcurrencyWhile(async () => {
      const max = Math.min(200, Math.max(2, Number(this.env.MAX_ROOM_MEMBERS) || 100));
      if (this.members().length >= (claims.room.startsWith('call-') ? 2 : max)) return json({ error: 'Room full' }, 429);
      if (await this.ctx.storage.get(`ticket:${claims.jti}`)) return json({ error: 'Ticket already used' }, 401);
      await this.ctx.storage.put(`ticket:${claims.jti}`, claims.exp);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      this.save(server, { id: claims.jti, identity: claims.sub, name: claims.name, canPublish: claims.canPublish === true,
        published: false, pubSession: null, pubMid: null, subSession: null,
        subscriptions: {}, pending: false, createdAt: Date.now(), lastSeen: Date.now(), minute: Date.now(), count: 0, closed: false });
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'weblogbook-radio-v1' } });
    });
  }
  enqueue(ws, operation) {
    const task = (this.queues.get(ws) || Promise.resolve()).then(operation);
    const settled = task.catch(() => {});
    this.queues.set(ws, settled);
    return task.finally(() => { if (this.queues.get(ws) === settled) this.queues.delete(ws); });
  }
  async provider(path, body, method = 'POST', turn = false, allowTrackErrors = false) {
    const response = await fetch(`${base}/${path}`, {
      method, headers: { Authorization: `Bearer ${turn ? this.env.TURN_API_TOKEN : this.env.SFU_APP_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Cloudflare transport unavailable');
    const result = await response.json();
    if (result.errorCode || (!allowTrackErrors && result.tracks?.some(t => t.errorCode))) {
      const code = result.errorCode || result.tracks.find(t => t.errorCode).errorCode;
      // Never expose provider descriptions, SDP, credentials or session locators.
      const publicCodes = ['not_found_track_error', 'empty_track_error', 'session_error', 'invalid_session_description', 'invalid_params', 'unauthorized'];
      throw new Error(`Cloudflare negotiation refused (${publicCodes.includes(code) ? code : 'provider_error'})`);
    }
    return result;
  }
  sessionPath(id, suffix) { return `apps/${encodeURIComponent(this.env.SFU_APP_ID)}/sessions/${encodeURIComponent(id)}/${suffix}`; }
  async newSession() {
    // A body-less session is negotiated later by tracks/new. Sending {} is rejected.
    const result = await this.provider(`apps/${encodeURIComponent(this.env.SFU_APP_ID)}/sessions/new`);
    if (!result.sessionId) throw new Error('Missing session');
    return result.sessionId;
  }
  async webSocketMessage(ws, message) {
    if ((this.queued.get(ws) || 0) >= 8) {
      try { ws.close(1008, 'Too many pending requests'); } catch { /* already closed */ }
      return;
    }
    this.queued.set(ws, (this.queued.get(ws) || 0) + 1);
    return this.enqueue(ws, async () => {
      const s = this.state(ws);
      if (!s || s.closed) return;
      let request;
      try {
        if (typeof message !== 'string' || message.length > 524_288) throw new Error('Invalid message');
        request = JSON.parse(message);
        if (!Number.isSafeInteger(request.id) || request.id < 1) throw new Error('Invalid request');
        s.lastSeen = Date.now();
        if (Date.now() - s.minute > 60_000) { s.minute = Date.now(); s.count = 0; }
        if (++s.count > 120) throw new Error('Too many requests');
        this.save(ws, s);
        const result = await this.handle(ws, s, request.action, request.payload || {});
        this.save(ws, s);
        this.send(ws, { id: request.id, result });
      } catch (error) {
        this.send(ws, { id: request?.id, error: error instanceof Error ? error.message : 'Radio error' });
        // A lost SDP response has an unknown provider outcome. Never blindly replay it.
        await this.close(ws);
      }
    }).finally(() => { const n = (this.queued.get(ws) || 1) - 1; if (n) this.queued.set(ws, n); else this.queued.delete(ws); });
  }
  async handle(ws, s, action, p) {
    if (action === 'ping') return {};
    if (action === 'hello') {
      if (s.hello) throw new Error('Already joined');
      s.hello = true;
      const result = await this.provider(`turn/keys/${encodeURIComponent(this.env.TURN_KEY_ID)}/credentials/generate-ice-servers`, { ttl: 86400 }, 'POST', true);
      if (!Array.isArray(result.iceServers) || !result.iceServers.length) throw new Error('TURN unavailable');
      this.broadcast();
      return { id: s.id, canPublish: s.canPublish === true, iceServers: result.iceServers, peers: this.peers(ws) };
    }
    if (!s.hello) throw new Error('Join first');
    if ((action === 'publish' || action === 'published') && s.canPublish !== true) throw new Error('OBS: receive only');
    if (action === 'publish') {
      if (s.pubSession || !p.sessionDescription || p.sessionDescription.type !== 'offer' ||
          typeof p.sessionDescription.sdp !== 'string' || !/^m=audio /m.test(p.sessionDescription.sdp) ||
          /^m=(video|application) /m.test(p.sessionDescription.sdp) || typeof p.mid !== 'string' || p.mid.length > 16) throw new Error('Invalid publication');
      s.pubSession = await this.newSession();
      s.pubMid = p.mid;
      this.save(ws, s);
      return this.provider(this.sessionPath(s.pubSession, 'tracks/new'), {
        sessionDescription: p.sessionDescription, tracks: [{ location: 'local', mid: p.mid, trackName: s.id }],
      });
    }
    if (action === 'published') {
      if (!s.pubSession || s.published) throw new Error('Invalid publication');
      s.published = true;
      this.save(ws, s);
      this.broadcast();
      return {};
    }
    if (action === 'subscribe') {
      if (s.pending || !Array.isArray(p.peers) || p.peers.length > 32 || !p.peers.every(id => typeof id === 'string')) throw new Error('Invalid subscription');
      // Clients never choose an SFU session/track locator; resolve within this authenticated room.
      const wanted = new Set(p.peers);
      const peers = this.members().filter(other => other !== ws).map(other => this.state(other))
        .filter(other => wanted.has(other.id) && other.published && !s.subscriptions[other.id]);
      if (!peers.length) return { tracks: [] };
      if (!s.subSession) s.subSession = await this.newSession();
      s.pending = true;
      this.save(ws, s);
      const result = await this.provider(this.sessionPath(s.subSession, 'tracks/new'), {
        tracks: peers.map(other => ({ location: 'remote', sessionId: other.pubSession, trackName: other.id })),
      }, 'POST', false, true);
      const seen = new Set();
      const tracks = [];
      for (const track of result.tracks || []) {
        const peer = peers.find(other => other.id === track.trackName && other.pubSession === track.sessionId);
        if (!peer || seen.has(peer.id)) throw new Error('Unexpected subscription');
        seen.add(peer.id);
        // A silent/expired source must not tear down other working subscriptions.
        // Retry these specific failures on a later client reconciliation.
        if (['not_found_track_error', 'empty_track_error'].includes(track.errorCode)) continue;
        if (track.errorCode) throw new Error('Cloudflare subscription refused');
        if (typeof track.mid !== 'string') throw new Error('Unexpected subscription');
        s.subscriptions[peer.id] = track.mid;
        tracks.push({ peerId: peer.id, mid: track.mid });
      }
      if (seen.size !== peers.length) throw new Error('Incomplete subscription');
      if (!tracks.length && !result.sessionDescription) {
        s.pending = false;
        return { tracks: [] };
      }
      if (result.sessionDescription?.type !== 'offer') throw new Error('Missing subscription offer');
      return { sessionDescription: result.sessionDescription, tracks };
    }
    if (action === 'answer') {
      if (!s.pending || !s.subSession || p.sessionDescription?.type !== 'answer' || typeof p.sessionDescription.sdp !== 'string') throw new Error('Unexpected answer');
      await this.provider(this.sessionPath(s.subSession, 'renegotiate'), { sessionDescription: p.sessionDescription }, 'PUT');
      s.pending = false;
      return {};
    }
    if (action === 'unsubscribe') {
      if (s.pending || !Array.isArray(p.peers) || p.peers.length > 200) throw new Error('Invalid unsubscribe');
      const ids = [...new Set(p.peers)].filter(id => Object.hasOwn(s.subscriptions, id));
      if (ids.length) await this.provider(this.sessionPath(s.subSession, 'tracks/close'), {
        tracks: ids.map(id => ({ mid: s.subscriptions[id] })), force: true,
      }, 'PUT');
      for (const id of ids) delete s.subscriptions[id];
      return {};
    }
    throw new Error('Unsupported action');
  }
  async close(ws) {
    const s = this.state(ws);
    if (!s || s.closed) return;
    s.closed = true;
    this.save(ws, s);
    try { ws.close(1000, 'Radio disconnected'); } catch { /* already closed */ }
    this.broadcast();
    const cleanup = [];
    if (s.pubSession && s.pubMid !== null) cleanup.push(this.provider(this.sessionPath(s.pubSession, 'tracks/close'), { tracks: [{ mid: s.pubMid }], force: true }, 'PUT'));
    const mids = Object.values(s.subscriptions);
    if (s.subSession && mids.length) cleanup.push(this.provider(this.sessionPath(s.subSession, 'tracks/close'), { tracks: mids.map(mid => ({ mid })), force: true }, 'PUT'));
    await Promise.allSettled(cleanup);
    this.queues.delete(ws);
  }
  webSocketClose(ws) { return this.enqueue(ws, () => this.close(ws)); }
  webSocketError(ws) { return this.enqueue(ws, () => this.close(ws)); }
  async alarm() {
    for (const ws of this.members()) {
      const s = this.state(ws);
      // Renew through a fresh join before the 24-hour TURN credentials expire.
      if (Date.now() - s.lastSeen > 90_000 || Date.now() - s.createdAt > 23 * 3600_000) await this.enqueue(ws, () => this.close(ws));
    }
    const tickets = await this.ctx.storage.list({ prefix: 'ticket:' });
    for (const [key, expiry] of tickets) if (expiry < Date.now() / 1000) await this.ctx.storage.delete(key);
    if (this.members().length || tickets.size) await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}

