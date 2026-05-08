'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { PhoneOff, Radio, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { setBriaCooldown, getBriaCooldownRemaining } from '@/lib/bria/cooldown';
import { createBriaClientTools, type BriaMessage } from '@/lib/bria/tools';
import { playPhoneRing, playPhoneEnd } from '@/lib/phone-sounds';
import { isIOS } from '@/lib/utils';

export { getBriaCooldownRemaining } from '@/lib/bria/cooldown';

// ─── Inner component (must be inside ConversationProvider) ───

interface BriaInnerProps {
  onClose: () => void;
}

function BriaInner({ onClose }: BriaInnerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<BriaMessage[]>([]);
  const [phase, setPhase] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const messagesRef = useRef<BriaMessage[]>([]);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const closedRef = useRef(false);

  const tools = useMemo(
    () =>
      createBriaClientTools({
        getConversationLog: () => messagesRef.current,
        router,
      }),
    [router],
  );

  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      if (!closedRef.current) {
        conv.endSession();
      }
    }, 30_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEnd() {
    if (closedRef.current) return;
    closedRef.current = true;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    playPhoneEnd();
    setBriaCooldown();
    setPhase('ended');
    setTimeout(() => onClose(), 600);
  }

  const conv = useConversation({
    clientTools: tools,
    onConnect: () => {
      setPhase('connected');
      resetInactivity();
    },
    onMessage: (payload: { message: string; role: 'user' | 'agent' }) => {
      const role: 'bria' | 'pilote' = payload.role === 'agent' ? 'bria' : 'pilote';
      const entry: BriaMessage = { role, text: payload.message };
      messagesRef.current = [...messagesRef.current, entry];
      setMessages([...messagesRef.current]);
      resetInactivity();
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: (message: string) => {
      console.error('BRIA error:', message);
      toast.error('Erreur BRIA');
      handleEnd();
    },
    onDisconnect: () => {
      handleEnd();
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      playPhoneRing();
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;
      try {
        const res = await fetch('/api/bria-session', { method: 'POST' });
        if (!res.ok) throw new Error('Session BRIA impossible');
        const { signedUrl } = await res.json();
        if (cancelled) return;
        conv.startSession({ signedUrl });
      } catch (e) {
        console.error('BRIA session start:', e);
        toast.error('Impossible de contacter le BRIA');
        handleEnd();
      }
    })();
    return () => {
      cancelled = true;
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMuted = conv.isMuted;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center"
      style={{ zIndex: 99999 }}
    >
      <div
        className="bg-[#0a0f1a] border border-emerald-500/20 rounded-lg shadow-[0_0_40px_rgba(16,185,129,0.06)] w-full max-w-2xl flex flex-col overflow-hidden"
        style={isIOS() ? { height: '85dvh', maxHeight: '85dvh' } : { height: '85vh' }}
      >
        {/* Header */}
        <div className="bg-slate-950 border-b border-emerald-500/15 px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Radio className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-mono font-bold text-emerald-300 tracking-widest">
                  BRIA // FPL SERVICE
                </h2>
                <p className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                  {phase === 'ringing' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      CONNECTING...
                    </>
                  ) : phase === 'ended' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      COMM TERMINATED
                    </>
                  ) : conv.isSpeaking ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      BRIA SPEAKING
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ON AIR — LISTENING
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => conv.setMuted(!isMuted)}
                className={`p-2 rounded border transition-colors ${
                  !isMuted
                    ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                    : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                }`}
                title={isMuted ? 'Réactiver le micro' : 'Couper le micro'}
              >
                {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  conv.endSession();
                }}
                disabled={phase === 'ended'}
                className="flex items-center gap-1.5 px-3 py-2 rounded border border-red-500/30 text-red-400 text-xs font-mono tracking-wide hover:bg-red-500/10 transition-colors disabled:opacity-30"
                title="Raccrocher"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">END</span>
              </button>
            </div>
          </div>
        </div>

        {phase === 'ringing' && (
          <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20">
            <p className="text-xs font-mono text-amber-400/80 text-center tracking-wide">
              STANDBY — CONNECTING TO BRIA...
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#060a12]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'bria' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded px-3.5 py-2 text-sm whitespace-pre-line font-mono leading-relaxed ${
                  msg.role === 'bria'
                    ? 'bg-emerald-950/50 border border-emerald-500/15 text-emerald-100/90'
                    : 'bg-cyan-950/50 border border-cyan-500/15 text-cyan-100/90'
                }`}
              >
                <span
                  className={`text-[10px] font-bold tracking-[0.2em] block mb-1 ${
                    msg.role === 'bria' ? 'text-emerald-500/70' : 'text-cyan-500/70'
                  }`}
                >
                  {msg.role === 'bria' ? 'BRIA' : 'PLT'}
                </span>
                {msg.text}
              </div>
            </div>
          ))}

          {phase === 'connected' && conv.isSpeaking && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-emerald-950/50 border border-emerald-500/15 rounded px-3.5 py-2">
                <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-500/70 block mb-1.5 font-mono">
                  BRIA
                </span>
                <div className="flex items-center gap-0.5">
                  <span className="w-1.5 h-4 bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-500/50 ml-1">TRANSMITTING</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Footer — voice mode indicator */}
        <div className="border-t border-emerald-500/10 px-4 py-3 bg-slate-950/80 shrink-0">
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-500">
            {phase === 'connected' ? (
              <>
                <Mic className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400/70">
                  {isMuted ? 'MICRO COUPÉ' : 'MODE VOCAL ACTIF'}
                </span>
              </>
            ) : phase === 'ringing' ? (
              <span className="text-amber-400/70 animate-pulse">APPEL EN COURS...</span>
            ) : (
              <span>COMMUNICATION TERMINÉE</span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Outer wrapper with ConversationProvider ───

interface BriaDialogProps {
  onClose: () => void;
}

export default function BriaDialog({ onClose }: BriaDialogProps) {
  return (
    <ConversationProvider>
      <BriaInner onClose={onClose} />
    </ConversationProvider>
  );
}
