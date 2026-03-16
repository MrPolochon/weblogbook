'use client';

import { useState, useEffect } from 'react';
import { Radio, X, Play, Square } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

interface AtcAtisButtonProps {
  aeroport: string;
  position: string;
  userId: string;
}

export default function AtcAtisButton({ aeroport, position, userId }: AtcAtisButtonProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [controllingUserId, setControllingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isController = controllingUserId === userId;
  const canStart = !broadcasting;
  const canStop = broadcasting && isController;
  const isGrayed = broadcasting && !isController;

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/atc/atis/status');
      const data = await res.json();
      if (res.ok) {
        setBroadcasting(!!data.broadcasting);
        setControllingUserId(data.controlling_user_id ?? null);
      }
    } catch (e) {
      console.error('ATIS status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    if (!canStart || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atc/atis/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aeroport, position }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcasting(true);
        setControllingUserId(userId);
        setIsOpen(false);
      } else {
        setError(data.error || 'Erreur au démarrage');
      }
    } catch (e) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!canStop || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atc/atis/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setBroadcasting(false);
        setControllingUserId(null);
        setIsOpen(false);
      } else {
        setError(data.error || 'Erreur à l\'arrêt');
      }
    } catch (e) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const bgMain = isDark ? 'bg-gradient-to-b from-slate-100 to-slate-200' : 'bg-gradient-to-b from-slate-800 to-slate-900';
  const textMain = isDark ? 'text-slate-800' : 'text-slate-100';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        disabled={isGrayed}
        className={`fixed bottom-4 left-4 z-50 ${bgMain} ${textMain} rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
          canStop ? 'ring-2 ring-red-500' : ''
        }`}
        title={isGrayed ? 'Un autre ATC contrôle le bot ATIS' : canStop ? 'Cliquer pour arrêter le broadcast' : 'Configurer le bot ATIS'}
      >
        <div className={`p-2 rounded-xl ${canStop ? 'bg-red-500/30' : isDark ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
          <Radio className={`h-5 w-5 ${canStop ? 'text-red-500' : isDark ? 'text-amber-600' : 'text-amber-400'}`} />
        </div>
        <span className="font-medium">ATIS</span>
        {broadcasting && <span className="text-xs opacity-80">● En direct</span>}
      </button>
    );
  }

  return (
    <div className={`fixed left-4 bottom-4 z-50 ${bgMain} rounded-3xl shadow-2xl overflow-hidden transition-all duration-500`} style={{ width: '240px' }}>
      <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-slate-300' : 'border-slate-700'}`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${isDark ? 'text-amber-600' : 'text-amber-400'}`} />
          <span className={`text-sm font-semibold ${textMain}`}>Bot ATIS</span>
        </div>
        <button onClick={() => { setIsOpen(false); setError(null); }} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-300' : 'hover:bg-slate-700'}`}>
          <X className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
        </button>
      </div>
      <div className={`p-4 space-y-3 ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
        {broadcasting ? (
          <p className="text-sm">
            {isController ? (
              <>Vous contrôlez le broadcast. Cliquez pour arrêter.</>
            ) : (
              <>Un autre ATC contrôle le bot. Le bouton sera disponible quand il s&apos;arrêtera.</>
            )}
          </p>
        ) : (
          <p className="text-sm">Démarrer le broadcast ATIS sur Discord.</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          {canStart && (
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Démarrer
            </button>
          )}
          {canStop && (
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-medium disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Arrêter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
