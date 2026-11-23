/** Audio-only Cloudflare SFU client, shared by the website and Electron.
 * All SFU credentials and room authorization live on the server.
 * Publisher and subscriber SDP exchanges use separate PeerConnections.
 */
export enum ConnectionState { Disconnected = 'disconnected', Connecting = 'connecting', Connected = 'connected', Reconnecting = 'reconnecting' }
export const Track = { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } } as const;
export const AudioPresets = { speech: { maxBitrate: 24_000 } };
export const RoomEvent = {
  Connected: 'connected', Disconnected: 'disconnected', ConnectionStateChanged: 'state',
  ParticipantConnected: 'peerJoined', ParticipantDisconnected: 'peerLeft', ActiveSpeakersChanged: 'speakers',
  TrackSubscribed: 'track', TrackUnsubscribed: 'untrack', AudioPlaybackStatusChanged: 'playback', MediaDevicesError: 'deviceError',
} as const;

export class LocalAudioTrack {
  constructor(public mediaStreamTrack: MediaStreamTrack) {}
  stop() { this.mediaStreamTrack.stop(); }
}
export class RemoteAudioTrack {
  kind = 'audio';
  private elements = new Set<HTMLAudioElement>();
  constructor(public sid: string, public mediaStreamTrack: MediaStreamTrack) {}
  attach() {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.elements.add(el);
    return el;
  }
  detach() {
    const elements = [...this.elements];
    elements.forEach(el => { el.pause(); el.srcObject = null; });
    this.elements.clear();
    return elements;
  }
}
export type RemoteParticipant = {
  identity: string; name: string; isSpeaking: boolean; audioLevel: number;
  audioTrackPublications: Map<string, { track: RemoteAudioTrack }>;
};
type Peer = { id: string; identity: string; name: string; published: boolean };
type Result = { canPublish?: boolean; id?: string; iceServers?: RTCIceServer[]; peers?: Peer[];
  sessionDescription?: RTCSessionDescriptionInit; tracks?: { mid: string; peerId: string }[] };
type Events = {
  connected: () => void; disconnected: () => void; state: (state: ConnectionState) => void;
  peerJoined: (peer: RemoteParticipant) => void; peerLeft: (peer: RemoteParticipant) => void;
  speakers: () => void; track: (track: RemoteAudioTrack) => void; untrack: (track: RemoteAudioTrack) => void;
  playback: () => void; deviceError: (error: unknown) => void;
};
type Options = { audioCaptureDefaults?: MediaTrackConstraints; adaptiveStream?: boolean; dynacast?: boolean };
function waitFor(pc: RTCPeerConnection, event: string, ready: () => boolean, timeout: number) {
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = () => { clearTimeout(timer); pc.removeEventListener(event, check); pc.removeEventListener('connectionstatechange', check); };
    const check = () => {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') { finish(); reject(new Error('Connexion audio interrompue.')); }
      else if (ready()) { finish(); resolve(); }
    };
    const timer = setTimeout(() => { finish(); reject(new Error('Délai de connexion audio dépassé.')); }, timeout);
    pc.addEventListener(event, check);
    pc.addEventListener('connectionstatechange', check);
    check();
  });
}
async function description(pc: RTCPeerConnection, offer: boolean) {
  const sdp = offer ? await pc.createOffer() : await pc.createAnswer();
  // Mono Opus speech: cap bandwidth, preserve FEC, suppress silent transmission.
  if (sdp.sdp) sdp.sdp = sdp.sdp.replace(/(a=fmtp:\d+ .*minptime[^\r\n]*)/g, '$1;usedtx=1;maxaveragebitrate=24000');
  await pc.setLocalDescription(sdp);
  await waitFor(pc, 'icegatheringstatechange', () => pc.iceGatheringState === 'complete', 12_000);
  return { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp };
}

export class Room {
  state = ConnectionState.Disconnected;
  canPlaybackAudio = true;
  canPublish = false;
  remoteParticipants = new Map<string, RemoteParticipant>();
  private listeners = new Map<keyof Events, Set<Function>>();
  private ws?: WebSocket;
  private publisher?: RTCPeerConnection;
  private subscriber?: RTCPeerConnection;
  private sender?: RTCRtpSender;
  private context?: AudioContext;
  private silence?: MediaStreamTrack;
  private microphone?: MediaStream;
  private captureRequest = 0;
  private enableRequest = 0;
  private input = '';
  private output = '';
  private closed = false;
  private requests = new Map<number, { resolve: (result: Result) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private desired: Peer[] = [];
  private subscribed = new Map<string, string>();
  private midPeers = new Map<string, string>();
  private tracks = new Map<string, RemoteAudioTrack>();
  private meters = new Map<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; data: Float32Array<ArrayBuffer> }>();
  private reconcileQueue = Promise.resolve();
  private heartbeat?: ReturnType<typeof setInterval>;
  private meterTimer?: ReturnType<typeof setInterval>;
  private failureTimer?: ReturnType<typeof setTimeout>;
  private publication = {
    mute: async () => { this.microphone?.getAudioTracks().forEach(t => { t.enabled = false; }); },
    unmute: async () => {
      if (this.canPublish && this.state === ConnectionState.Connected) this.microphone?.getAudioTracks().forEach(t => { t.enabled = true; });
    },
  };
  readonly localParticipant = {
    publishTrack: async (track: LocalAudioTrack, _options?: unknown) => {
      if (!this.canPublish) throw new Error('OBS : écoute uniquement.');
      if (!this.sender || this.closed) throw new Error('Radio déconnectée.');
      await this.sender.replaceTrack(track.mediaStreamTrack);
    },
    unpublishTrack: async (track: LocalAudioTrack) => {
      if (this.sender?.track === track.mediaStreamTrack) await this.sender.replaceTrack(this.silence || null);
    },
    setMicrophoneEnabled: async (enabled: boolean) => {
      const request = ++this.enableRequest;
      if (!enabled) { ++this.captureRequest; await this.publication.mute(); return; }
      await this.prepareMicrophone();
      if (request === this.enableRequest) await this.publication.unmute();
    },
    getTrackPublication: (_source: string) => this.microphone ? this.publication : undefined,
  };
  constructor(private options: Options = {}) {}
  on<E extends keyof Events>(event: E, listener: Events[E]) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }
  removeAllListeners() { this.listeners.clear(); }
  private emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>) {
    this.listeners.get(event)?.forEach(fn => { fn(...args); });
  }
  private setState(state: ConnectionState) {
    if (this.state === state) return;
    this.state = state;
    if (state !== ConnectionState.Connected) void this.publication.mute();
    this.emit('state', state);
  }
  private rpc(action: string, payload: unknown = {}): Promise<Result> {
    if (this.closed || this.ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Signal radio déconnecté.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(id); reject(new Error('Cloudflare ne répond pas.')); void this.disconnect(); }, 20_000);
      this.requests.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, action, payload }));
    });
  }
  async connect(url: string, token: string, options?: { canPublish?: boolean; autoSubscribe?: boolean }) {
    if (this.ws || this.closed) throw new Error('Créer une nouvelle connexion radio.');
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('URL radio non sécurisée.');
    this.setState(ConnectionState.Connecting);
    this.context = new AudioContext();
    void this.context.resume().catch(() => {});
    this.silence = this.context.createMediaStreamDestination().stream.getAudioTracks()[0];
    const ws = this.ws = new WebSocket(url, ['weblogbook-radio-v1', `ticket.${token}`]);
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === 'peers') { this.desired = message.peers; this.reconcile(); return; }
        const pending = this.requests.get(message.id);
        if (!pending) return;
        this.requests.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
      } catch { void this.disconnect(); }
    };
    ws.onclose = () => { void this.disconnect(); };
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { reject(new Error('Connexion Cloudflare expirée.')); ws.close(); }, 15_000);
        const cleanup = () => { clearTimeout(timer); ws.removeEventListener('open', open); ws.removeEventListener('error', error); ws.removeEventListener('close', error); };
        const open = () => { cleanup(); resolve(); };
        const error = () => { cleanup(); reject(new Error('Connexion Cloudflare refusée.')); };
        ws.addEventListener('open', open); ws.addEventListener('error', error); ws.addEventListener('close', error);
      });
      const hello = await this.rpc('hello');
      this.assertOpen();
      this.canPublish = options?.canPublish !== false && hello.canPublish !== false;
      this.desired = hello.peers || [];
      const configuration = { iceServers: hello.iceServers };
      this.subscriber = new RTCPeerConnection(configuration);
      this.subscriber.onconnectionstatechange = () => this.checkConnection();
      this.subscriber.ontrack = event => this.receiveTrack(event);
      if (this.canPublish) {
      this.publisher = new RTCPeerConnection(configuration);
      this.publisher.onconnectionstatechange = () => this.checkConnection();
      const transceiver = this.publisher.addTransceiver(this.silence!, { direction: 'sendonly' });
      this.sender = transceiver.sender;
      const offer = await description(this.publisher, true);
      const answer = await this.rpc('publish', { mid: transceiver.mid, sessionDescription: offer });
      if (!answer.sessionDescription) throw new Error('Réponse audio absente.');
      await this.publisher.setRemoteDescription(answer.sessionDescription);
      await waitFor(this.publisher, 'connectionstatechange', () => this.publisher?.connectionState === 'connected', 15_000);
      await this.rpc('published');
      }
      this.assertOpen();
      this.heartbeat = setInterval(() => { void this.rpc('ping').catch(() => this.disconnect()); }, 25_000);
      this.meterTimer = setInterval(() => this.measure(), 150);
      await this.reconcile();
      this.assertOpen();
      this.setState(ConnectionState.Connected);
      this.emit('connected');
    } catch (error) { await this.disconnect(); throw error; }
  }
  private assertOpen() { if (this.closed) throw new Error('Radio déconnectée.'); }
  private checkConnection() {
    if (this.closed) return;
    const states = [this.publisher?.connectionState, this.subscriber?.connectionState];
    if (states.includes('failed')) { void this.disconnect(); return; }
    if (states.includes('disconnected')) {
      this.setState(ConnectionState.Reconnecting);
      if (!this.failureTimer) this.failureTimer = setTimeout(() => { void this.disconnect(); }, 5000);
    } else if (this.failureTimer) { clearTimeout(this.failureTimer); this.failureTimer = undefined; this.setState(ConnectionState.Connected); }
  }
  private reconcile() {
    if (!this.subscriber || this.closed) return this.reconcileQueue;
    this.reconcileQueue = this.reconcileQueue.then(async () => {
      if (this.closed) return;
      const desired = new Map(this.desired.map(p => [p.id, p]));
      const removed = [...this.subscribed.keys()].filter(id => !desired.get(id)?.published);
      if (removed.length) {
        await this.rpc('unsubscribe', { peers: removed });
        for (const id of removed) { this.midPeers.delete(this.subscribed.get(id)!); this.subscribed.delete(id); this.removeTrack(id); }
      }
      for (const [id, peer] of this.remoteParticipants) if (!desired.has(id)) {
        this.remoteParticipants.delete(id); this.emit('peerLeft', peer);
      }
      for (const [id, peer] of desired) if (!this.remoteParticipants.has(id)) {
        const participant = { identity: id, name: peer.name, isSpeaking: false, audioLevel: 0, audioTrackPublications: new Map() };
        this.remoteParticipants.set(id, participant); this.emit('peerJoined', participant);
      }
      const added = [...desired.values()].filter(p => p.published && !this.subscribed.has(p.id));
      for (let i = 0; i < added.length; i += 32) {
        const result = await this.rpc('subscribe', { peers: added.slice(i, i + 32).map(p => p.id) });
        if (!result.sessionDescription) continue;
        for (const track of result.tracks || []) { this.subscribed.set(track.peerId, track.mid); this.midPeers.set(track.mid, track.peerId); }
        await this.subscriber!.setRemoteDescription(result.sessionDescription);
        // A reused receiver may not emit another ontrack event after a peer leaves.
        for (const transceiver of this.subscriber!.getTransceivers()) {
          this.receiveTrack({ transceiver, track: transceiver.receiver.track });
        }
        const answer = await description(this.subscriber!, false);
        await this.rpc('answer', { sessionDescription: answer });
      }
    }).catch(() => { void this.disconnect(); });
    return this.reconcileQueue;
  }
  private receiveTrack(event: Pick<RTCTrackEvent, 'transceiver' | 'track'>) {
    const id = this.midPeers.get(event.transceiver.mid || '');
    if (!id || event.track.kind !== 'audio' || !this.context) return;
    if (this.tracks.get(id)?.mediaStreamTrack === event.track) return;
    this.removeTrack(id);
    const track = new RemoteAudioTrack(id, event.track);
    this.tracks.set(id, track);
    this.remoteParticipants.get(id)?.audioTrackPublications.set(id, { track });
    const source = this.context.createMediaStreamSource(new MediaStream([event.track]));
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.meters.set(id, { source, analyser, data: new Float32Array(256) });
    this.emit('track', track);
  }
  private removeTrack(id: string) {
    const track = this.tracks.get(id);
    if (track) { this.emit('untrack', track); track.detach().forEach(el => el.remove()); }
    this.tracks.delete(id);
    this.remoteParticipants.get(id)?.audioTrackPublications.delete(id);
    const meter = this.meters.get(id); meter?.source.disconnect(); meter?.analyser.disconnect(); this.meters.delete(id);
  }
  private measure() {
    let changed = false;
    for (const [id, meter] of this.meters) {
      const peer = this.remoteParticipants.get(id);
      if (!peer) continue;
      meter.analyser.getFloatTimeDomainData(meter.data);
      peer.audioLevel = Math.sqrt(meter.data.reduce((sum, n) => sum + n * n, 0) / meter.data.length);
      const speaking = peer.audioLevel > 0.01;
      if (peer.isSpeaking !== speaking) { peer.isSpeaking = speaking; changed = true; }
    }
    if (changed) this.emit('speakers');
  }
  /** Acquires hardware disabled. A PTT client must call unmute only while held. */
  async prepareMicrophone() {
    if (!this.canPublish) throw new Error('OBS : écoute uniquement.');
    if (this.microphone) return;
    const request = ++this.captureRequest;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
      ...this.options.audioCaptureDefaults, ...(this.input ? { deviceId: { exact: this.input } } : {}),
    } });
    stream.getAudioTracks().forEach(t => { t.enabled = false; });
    if (this.closed || request !== this.captureRequest) { stream.getTracks().forEach(t => t.stop()); throw new Error('Activation du microphone annulée.'); }
    this.microphone = stream;
    try { await this.sender!.replaceTrack(stream.getAudioTracks()[0]); }
    catch (error) { stream.getTracks().forEach(t => t.stop()); this.microphone = undefined; throw error; }
  }
  async switchActiveDevice(kind: string, id: string) {
    if (kind === 'audioinput') {
      this.input = id;
      if (this.microphone) { await this.publication.mute(); this.microphone.getTracks().forEach(t => t.stop()); this.microphone = undefined; await this.prepareMicrophone(); }
    } else if (kind === 'audiooutput') this.output = id;
  }
  async startAudio() {
    await this.context?.resume();
    this.canPlaybackAudio = this.context?.state === 'running';
    this.emit('playback');
  }
  async disconnect(_stopTracks = true) {
    if (this.closed) return;
    this.closed = true;
    ++this.captureRequest;
    ++this.enableRequest;
    void this.publication.mute();
    this.microphone?.getTracks().forEach(t => t.stop());
    this.setState(ConnectionState.Disconnected);
    clearInterval(this.heartbeat); clearInterval(this.meterTimer); clearTimeout(this.failureTimer);
    this.ws?.close(); this.publisher?.close(); this.subscriber?.close(); this.silence?.stop();
    for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(new Error('Radio déconnectée.')); }
    this.requests.clear();
    for (const id of this.tracks.keys()) this.removeTrack(id);
    this.remoteParticipants.clear();
    if (this.context?.state !== 'closed') void this.context?.close().catch(() => {});
    this.emit('disconnected');
  }
}
