'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio, Mic, MicOff, Power, ArrowLeftRight, RefreshCw,
  AlertTriangle, Users, LogIn, Loader2, Plane, Flame,
  Settings2, Volume2, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import VhfDial from '@/components/VhfDial';
import {
  ALL_VHF_DECIMALS, getMhzRange, getDecimalsForMhz,
  formatFrequency, parseFrequency, frequencyToRoomName,
  isValidVhfFrequency,
} from '@/lib/vhf-frequencies';
import { createClient } from '@supabase/supabase-js';
import {
  Room, RoomEvent, Track, ConnectionState, RemoteParticipant,
} from 'livekit-client';

/* ─── Config ─── */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL_DOMAIN = 'logbook.local';

/* ─── Types ─── */
type RadioMode = 'pilot' | 'atc' | 'afis';
type AppScreen = 'login' | 'radio';
interface UserProfile {
  id: string; identifiant: string; role: string; atc: boolean; siavi: boolean;
}
interface ParticipantInfo {
  identity: string; name: string; isSpeaking: boolean;
}

/* ─── PTT constants ─── */
const COLLISION_THRESHOLD = 0.01;
const COLLISION_CHECK_MS = 300;

/* ══════════════════════════════════════════════════
   Page /radio — Mobile-first VHF Radio
   ══════════════════════════════════════════════════ */

export default function MobileRadioPage() {
  const [screen, setScreen] = useState<AppScreen>('login');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [radioMode, setRadioMode] = useState<RadioMode>('pilot');

  if (screen === 'login' || !profile) {
    return (
      <LoginPanel
        onLogin={(p, mode, token) => {
          setProfile(p);
          setRadioMode(mode);
          setAccessToken(token);
          setScreen('radio');
        }}
      />
    );
  }

  return (
    <MobileVhfRadio
      profile={profile}
      mode={radioMode}
      accessToken={accessToken}
      onLogout={() => { setProfile(null); setAccessToken(''); setScreen('login'); }}
    />
  );
}

/* ══════════════════════════════════════════════════
   Login Panel
   ══════════════════════════════════════════════════ */

function LoginPanel({ onLogin }: {
  onLogin: (p: UserProfile, mode: RadioMode, token: string) => void;
}) {
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<RadioMode>('pilot');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const email = `${identifiant.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
      const { data, error: authErr } = await sb.auth.signInWithPassword({ email, password });
      if (authErr) { setError(authErr.message === 'Invalid login credentials' ? 'Identifiant ou mot de passe incorrect' : authErr.message); return; }
      if (!data.user) { setError('Connexion échouée'); return; }

      const { data: prof } = await sb.from('profiles').select('identifiant, role, atc, siavi').eq('id', data.user.id).single();
      if (!prof) { setError('Profil introuvable'); return; }

      if (mode === 'atc' && !(prof.role === 'admin' || prof.role === 'atc' || prof.atc)) { setError('Pas d\'accès ATC'); return; }
      if (mode === 'afis' && !(prof.role === 'admin' || prof.role === 'siavi' || prof.siavi)) { setError('Pas d\'accès AFIS'); return; }

      const token = data.session?.access_token || '';
      await sb.auth.signOut({ scope: 'local' });

      onLogin({ id: data.user.id, identifiant: prof.identifiant, role: prof.role, atc: prof.atc ?? false, siavi: prof.siavi ?? false }, mode, token);
    } catch { setError('Erreur réseau'); } finally { setLoading(false); }
  }

  const modeColors = { pilot: 'bg-sky-500', atc: 'bg-emerald-500', afis: 'bg-red-500' };
  const ModeIcons = { pilot: Plane, atc: Radio, afis: Flame };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 mb-3">
            <Radio className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white">VHF Radio Mobile</h1>
          <p className="text-xs text-slate-400 mt-1">Contrôle depuis les notifications</p>
        </div>

        <div className="flex gap-1 mb-4 p-1 bg-slate-800/60 rounded-xl">
          {(['pilot', 'atc', 'afis'] as RadioMode[]).map(m => {
            const Icon = ModeIcons[m];
            return (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg font-semibold text-xs transition-all ${mode === m ? `${modeColors[m]} text-white shadow-lg` : 'text-slate-400 hover:text-slate-200'}`}>
                <Icon className="h-3.5 w-3.5" /> {m === 'pilot' ? 'Pilote' : m.toUpperCase()}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={identifiant} onChange={e => setIdentifiant(e.target.value)} required autoFocus placeholder="Identifiant"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Mot de passe"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50" />
          {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 border border-red-500/30">{error}</p>}
          <button type="submit" disabled={loading}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm text-white ${modeColors[mode]} disabled:opacity-50 flex items-center justify-center gap-2`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? 'Connexion...' : 'Connexion'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Mobile VHF Radio
   ══════════════════════════════════════════════════ */

function MobileVhfRadio({ profile, mode, accessToken, onLogout }: {
  profile: UserProfile; mode: RadioMode; accessToken: string; onLogout: () => void;
}) {
  const mhzRange = getMhzRange();
  const isLocked = mode !== 'pilot';

  /* ── Session / frequency ── */
  const [sessionInfo, setSessionInfo] = useState('');
  const [lockedFrequency, setLockedFrequency] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const lastSessionKeyRef = useRef('');

  /* ── Radio ON/OFF ── */
  const [radioOn, setRadioOn] = useState(false);

  /* ── Frequencies ── */
  const initialFreq = lockedFrequency ? parseFrequency(lockedFrequency) : null;
  const [actMhzIdx, setActMhzIdx] = useState(initialFreq ? mhzRange.indexOf(initialFreq.mhz) : 0);
  const [actDecIdx, setActDecIdx] = useState(initialFreq ? ALL_VHF_DECIMALS.indexOf(initialFreq.decimal) : 0);
  const [stbyMhzIdx, setStbyMhzIdx] = useState(initialFreq ? mhzRange.indexOf(initialFreq.mhz) : 0);
  const [stbyDecIdx, setStbyDecIdx] = useState(initialFreq ? ALL_VHF_DECIMALS.indexOf(initialFreq.decimal) : 0);

  const actMhz = mhzRange[actMhzIdx] ?? 118;
  const actDecs = getDecimalsForMhz(actMhz);
  const safeActDec = Math.min(actDecIdx, actDecs.length - 1);
  const activeFreq = formatFrequency(actMhz, actDecs[safeActDec] ?? '000');

  const stbyMhz = mhzRange[stbyMhzIdx] ?? 118;
  const stbyDecs = getDecimalsForMhz(stbyMhz);
  const safeStbyDec = Math.min(stbyDecIdx, stbyDecs.length - 1);
  const standbyFreq = formatFrequency(stbyMhz, stbyDecs[safeStbyDec] ?? '000');

  /* ── LiveKit ── */
  const roomRef = useRef<Room | null>(null);
  const [connState, setConnState] = useState<string>('disconnected');
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const attachedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  /* ── PTT ── */
  const [isTransmitting, setIsTransmitting] = useState(false);
  const pttActiveRef = useRef(false);

  /* ── Collision ── */
  const [collision, setCollision] = useState(false);
  const collisionOscRef = useRef<OscillatorNode | null>(null);
  const collisionCtxRef = useRef<AudioContext | null>(null);

  /* ── UI ── */
  const [showFreqPopup, setShowFreqPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);

  /* ── Keep-alive audio for background ── */
  const keepAliveRef = useRef<HTMLAudioElement | null>(null);

  /* ══════════ Session check via API ══════════ */
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (cancelled || mode === 'pilot') return;
      try {
        const res = await fetch(`/api/atc/my-session?mode=${mode}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const info = data.session ? `${data.session.aeroport} ${data.session.position}` : '';
        const freq = data.frequency || null;
        const key = `${info}|${freq}|${data.noSession}`;
        if (key !== lastSessionKeyRef.current) {
          lastSessionKeyRef.current = key;
          setSessionInfo(info);
          setLockedFrequency(freq);
          setNoSession(data.noSession);
          if (freq) {
            const p = parseFrequency(freq);
            if (p) {
              setActMhzIdx(mhzRange.indexOf(p.mhz));
              setActDecIdx(ALL_VHF_DECIMALS.indexOf(p.decimal));
              setStbyMhzIdx(mhzRange.indexOf(p.mhz));
              setStbyDecIdx(ALL_VHF_DECIMALS.indexOf(p.decimal));
            }
          }
        }
      } catch { /* silent */ }
    }
    check();
    const iv = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [mode, accessToken, mhzRange]);

  /* ══════════ Audio devices ══════════ */
  useEffect(() => {
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const devs = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devs.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devs.filter(d => d.kind === 'audiooutput'));
      } catch { /* */ }
    })();
  }, []);

  /* ══════════ PTT ══════════ */
  const startTransmit = useCallback(async () => {
    if (!radioOn || pttActiveRef.current) return;
    pttActiveRef.current = true;
    setIsTransmitting(true);
    try {
      const mic = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (mic) await mic.unmute();
    } catch { /* */ }
  }, [radioOn]);

  const stopTransmit = useCallback(async () => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setIsTransmitting(false);
    try {
      const mic = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (mic) await mic.mute();
    } catch { /* */ }
  }, []);

  const toggleTransmit = useCallback(() => {
    if (pttActiveRef.current) stopTransmit(); else startTransmit();
  }, [startTransmit, stopTransmit]);

  /* ══════════ LiveKit ══════════ */
  const cleanupRoom = useCallback(() => {
    if (collisionOscRef.current) { try { collisionOscRef.current.stop(); } catch { /* */ } collisionOscRef.current = null; }
    attachedAudioRef.current.forEach(el => { try { el.pause(); el.remove(); } catch { /* */ } });
    attachedAudioRef.current.clear();
    const room = roomRef.current;
    if (room) { room.removeAllListeners(); room.disconnect(true); roomRef.current = null; }
    setConnState('disconnected'); setParticipants([]); setIsTransmitting(false); setCollision(false);
    pttActiveRef.current = false;
  }, []);

  const connectToFrequency = useCallback(async (freq: string) => {
    if (!isValidVhfFrequency(freq)) return;
    cleanupRoom();
    try {
      setConnState('connecting');
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ roomName: frequencyToRoomName(freq), participantName: sessionInfo ? `${profile.identifiant} (${sessionInfo})` : profile.identifiant }),
      });
      if (!res.ok) { setConnState('error'); return; }
      const { token, url } = await res.json();
      if (!token || !url) { setConnState('error'); return; }

      const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, deviceId: selectedInput || undefined } });
      room.on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => setConnState(s));
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach() as HTMLAudioElement; el.volume = 1.0;
        if (selectedOutput && 'setSinkId' in el) (el as any).setSinkId(selectedOutput).catch(() => {});
        (audioContainerRef.current ?? document.body).appendChild(el);
        attachedAudioRef.current.set(track.sid ?? '', el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        const el = attachedAudioRef.current.get(track.sid ?? '');
        if (el) { el.pause(); el.remove(); attachedAudioRef.current.delete(track.sid ?? ''); }
      });
      room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room));
      await room.connect(url, token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) await micPub.mute();
      roomRef.current = room;
      updateParticipants(room);
    } catch (err) { console.error('[VHF]', err); setConnState('error'); }
  }, [cleanupRoom, accessToken, sessionInfo, profile, selectedInput, selectedOutput]);

  function updateParticipants(room: Room) {
    const list: ParticipantInfo[] = [];
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: p.isSpeaking });
    });
    setParticipants(list);
  }

  /* ── Auto connect/disconnect ── */
  const prevFreqRef = useRef('');
  useEffect(() => {
    if (!radioOn) { if (roomRef.current) cleanupRoom(); prevFreqRef.current = ''; return; }
    if (activeFreq !== prevFreqRef.current) { prevFreqRef.current = activeFreq; connectToFrequency(activeFreq); }
  }, [radioOn, activeFreq, cleanupRoom, connectToFrequency]);

  useEffect(() => {
    if (isLocked && lockedFrequency) setRadioOn(true);
  }, [isLocked, lockedFrequency]);

  useEffect(() => () => { cleanupRoom(); }, [cleanupRoom]);

  /* ── Collision detection ── */
  useEffect(() => {
    const iv = setInterval(() => {
      const room = roomRef.current; if (!room) return;
      let speaking = 0;
      if (pttActiveRef.current) speaking++;
      const list: ParticipantInfo[] = [];
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        const s = p.audioLevel > COLLISION_THRESHOLD; if (s) speaking++;
        list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: s });
      });
      setParticipants(list);
      setCollision(speaking >= 2);
    }, COLLISION_CHECK_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (collision) {
      try {
        if (!collisionCtxRef.current) collisionCtxRef.current = new AudioContext();
        const ctx = collisionCtxRef.current;
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 1200; gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination); osc.start();
        collisionOscRef.current = osc;
      } catch { /* */ }
    } else {
      if (collisionOscRef.current) { try { collisionOscRef.current.stop(); } catch { /* */ } collisionOscRef.current = null; }
    }
  }, [collision]);

  /* ══════════ MediaSession API (background controls) ══════════ */
  useEffect(() => {
    if (!('mediaSession' in navigator) || !radioOn) return;

    // Keep-alive: silent audio to prevent browser from suspending the tab
    if (!keepAliveRef.current) {
      const audio = new Audio();
      // Create a tiny silent WAV as data URI
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.loop = true;
      audio.volume = 0.01;
      audio.play().catch(() => {});
      keepAliveRef.current = audio;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: `VHF ${activeFreq}`,
      artist: isTransmitting ? '🔴 TX — Transmission' : '📻 RX — Réception',
      album: sessionInfo || profile.identifiant,
    });

    navigator.mediaSession.playbackState = radioOn ? 'playing' : 'paused';

    // Play/Pause = Toggle PTT
    navigator.mediaSession.setActionHandler('play', () => { if (!pttActiveRef.current) startTransmit(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (pttActiveRef.current) stopTransmit(); });

    // Next/Previous = Step frequency (pilot only)
    if (!isLocked) {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        setStbyDecIdx(prev => {
          const decs = getDecimalsForMhz(stbyMhz);
          return Math.min(prev + 1, decs.length - 1);
        });
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        setStbyDecIdx(prev => Math.max(prev - 1, 0));
      });
    }

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
    };
  }, [radioOn, activeFreq, isTransmitting, sessionInfo, profile, isLocked, startTransmit, stopTransmit, stbyMhz]);

  // Cleanup keep-alive on unmount
  useEffect(() => () => {
    if (keepAliveRef.current) { keepAliveRef.current.pause(); keepAliveRef.current = null; }
  }, []);

  /* ══════════ Swap frequencies ══════════ */
  function handleSwap() {
    if (isLocked) return;
    const tm = actMhzIdx, td = actDecIdx;
    setActMhzIdx(stbyMhzIdx); setActDecIdx(stbyDecIdx);
    setStbyMhzIdx(tm); setStbyDecIdx(td);
  }

  const handleReconnect = useCallback(async () => {
    if (isReconnecting || !radioOn) return;
    setIsReconnecting(true); cleanupRoom();
    await new Promise(r => setTimeout(r, 500));
    prevFreqRef.current = '';
    await connectToFrequency(activeFreq);
    setIsReconnecting(false);
  }, [isReconnecting, radioOn, cleanupRoom, connectToFrequency, activeFreq]);

  const isConnected = connState === 'connected';
  const isConnecting = connState === 'connecting';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col relative">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700/50 safe-area-top">
        <div className="flex items-center gap-1.5 min-w-0">
          <Radio className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-300 truncate">{profile.identifiant}</span>
          {sessionInfo && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono flex-shrink-0">{sessionInfo}</span>}
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 flex-shrink-0">{mode.toUpperCase()}</span>
        </div>
        <button onClick={onLogout} className="p-1.5 text-slate-500 hover:text-red-400"><LogIn className="h-3.5 w-3.5" /></button>
      </div>

      {/* ── No session warning ── */}
      {noSession && mode !== 'pilot' && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-300"><strong>Aucune session {mode === 'atc' ? 'ATC' : 'AFIS'} active.</strong> Met-toi en service sur le site.</p>
        </div>
      )}

      {/* ── Radio panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {/* ON/OFF + Status */}
        <div className="flex items-center gap-3">
          <button onClick={() => { if (radioOn) { cleanupRoom(); setRadioOn(false); } else setRadioOn(true); }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${radioOn ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-700 text-slate-500'}`}>
            <Power className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${!radioOn ? 'bg-slate-600' : isConnected ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-400">{!radioOn ? 'OFF' : isConnected ? 'EN LIGNE' : isConnecting ? 'CONNEXION...' : 'HORS LIGNE'}</span>
            {radioOn && <button onClick={handleReconnect} disabled={isReconnecting} className="p-1 text-slate-500 hover:text-slate-200"><RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} /></button>}
          </div>
        </div>

        {/* Frequency display */}
        <div className={`w-full max-w-xs rounded-xl p-4 ${collision ? 'bg-red-950/40 border border-red-500/50' : 'bg-slate-800/60 border border-slate-700/50'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">ACT</div>
              <div className={`font-mono text-3xl font-bold tracking-wider ${!radioOn ? 'text-slate-600' : collision ? 'text-red-400 animate-pulse' : 'text-emerald-300'}`}>{activeFreq}</div>
            </div>
            {!isLocked && (
              <button onClick={handleSwap} disabled={!radioOn} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-400 disabled:opacity-30">
                <ArrowLeftRight className="h-5 w-5" />
              </button>
            )}
            <div className="flex-1 text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">STBY</div>
              <div className={`font-mono text-3xl font-bold tracking-wider ${!radioOn ? 'text-slate-600' : 'text-amber-300/70'}`}>{standbyFreq}</div>
            </div>
          </div>
          {collision && (
            <div className="flex items-center justify-center gap-1 mt-2">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-[10px] text-red-400 font-semibold">DOUBLE TRANSMISSION</span>
            </div>
          )}
        </div>

        {/* Change frequency button (pilot only) */}
        {!isLocked && radioOn && (
          <button onClick={() => setShowFreqPopup(true)}
            className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 active:scale-95 transition-all">
            Changer la fréquence
          </button>
        )}

        {/* Participants */}
        {isConnected && radioOn && participants.length > 0 && (
          <div className="w-full max-w-xs">
            <div className="flex items-center gap-1 mb-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span className="text-[10px] text-slate-400 uppercase">Sur la fréquence ({participants.length})</span>
            </div>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {participants.map(p => (
                <div key={p.identity} className={`flex items-center gap-1.5 text-xs rounded px-2 py-0.5 ${p.isSpeaking ? 'bg-emerald-900/30 text-emerald-300' : 'text-slate-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${p.isSpeaking ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="font-mono text-[11px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] text-slate-500 flex items-center gap-1">
          <Settings2 className="h-3 w-3" /> Paramètres audio
        </button>
        {showSettings && (
          <div className="w-full max-w-xs p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-2">
            {audioInputs.length > 0 && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1"><Mic className="h-3 w-3 inline mr-1" />Micro</label>
                <select value={selectedInput} onChange={e => setSelectedInput(e.target.value)}
                  className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1.5 border border-slate-600">
                  <option value="">Par défaut</option>
                  {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
                </select>
              </div>
            )}
            {audioOutputs.length > 0 && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1"><Volume2 className="h-3 w-3 inline mr-1" />Sortie</label>
                <select value={selectedOutput} onChange={e => setSelectedOutput(e.target.value)}
                  className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1.5 border border-slate-600">
                  <option value="">Par défaut</option>
                  {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* MediaSession info */}
        {radioOn && (
          <p className="text-[9px] text-slate-600 text-center max-w-xs">
            📱 Contrôle depuis les notifications : ▶️ Pause = PTT
            {!isLocked && ' | ⏭ ⏮ = Fréquence'}
          </p>
        )}
      </div>

      {/* ══════════ FLOATING PTT BUTTON ══════════ */}
      {radioOn && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 safe-area-bottom pointer-events-none">
          <button
            onTouchStart={(e) => { e.preventDefault(); startTransmit(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopTransmit(); }}
            onMouseDown={startTransmit}
            onMouseUp={stopTransmit}
            onMouseLeave={stopTransmit}
            disabled={!isConnected}
            className={`pointer-events-auto w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 select-none touch-manipulation ${
              isTransmitting
                ? 'bg-emerald-500 text-white shadow-emerald-500/40 scale-110'
                : isConnected
                  ? 'bg-slate-700 text-slate-300 border-2 border-slate-600 hover:bg-slate-600'
                  : 'bg-slate-800 text-slate-600 border-2 border-slate-700 cursor-not-allowed'
            }`}
          >
            {isTransmitting ? <Mic className="h-8 w-8" /> : <MicOff className="h-8 w-8" />}
          </button>
        </div>
      )}

      {/* ══════════ FREQUENCY CHANGE POPUP ══════════ */}
      {showFreqPopup && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end justify-center" onClick={() => setShowFreqPopup(false)}>
          <div className="w-full max-w-md bg-slate-900 border-t border-slate-700 rounded-t-2xl p-5 pb-8 safe-area-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Réglage fréquence STBY</h3>
              <button onClick={() => setShowFreqPopup(false)} className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-center mb-4">
              <span className="font-mono text-3xl font-bold text-amber-300">{standbyFreq}</span>
            </div>

            <div className="flex items-center justify-center gap-4">
              <VhfDial values={mhzRange.map(String)} currentIndex={stbyMhzIdx} onChange={setStbyMhzIdx} label="MHz" size={80} />
              <span className="text-3xl font-mono text-slate-500 mt-5">.</span>
              <VhfDial values={stbyDecs} currentIndex={safeStbyDec} onChange={idx => setStbyDecIdx(Math.min(idx, stbyDecs.length - 1))} label="kHz" size={80} />
            </div>

            <button onClick={() => { handleSwap(); setShowFreqPopup(false); }}
              className="w-full mt-5 py-3 rounded-lg bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
              <ArrowLeftRight className="h-4 w-4" /> Appliquer (Swap ACT ⇄ STBY)
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio container */}
      <div ref={audioContainerRef} className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden />
    </div>
  );
}
