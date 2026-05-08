'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

const TICKER_INTERVAL_MS = 30000;
const POLL_INTERVAL_MS = 8000;

interface OverviewLite {
  any_broadcasting?: boolean;
  broadcasting?: boolean;
  atis_text?: string | null;
  atis_ticker_visible?: boolean;
}

export default function AtcAtisTicker() {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [broadcasting, setBroadcasting] = useState(false);
  const [atisText, setAtisText] = useState<string | null>(null);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      // Utilise l'endpoint consolide /overview qui retourne deja le focused atis_text.
      const res = await fetch('/api/atc/atis/overview');
      const data: OverviewLite = await res.json();
      if (res.ok) {
        // Champ legacy "broadcasting" = focused mine ou 1ere active.
        // Pour le ticker, on utilise any_broadcasting pour afficher le texte
        // meme si l'ATC ne controle aucun ATIS (info pour les autres).
        setBroadcasting(Boolean(data.any_broadcasting ?? data.broadcasting));
        setAtisText(data.atis_text ?? null);
        setTickerVisible(data.atis_ticker_visible ?? true);
      }
    } catch (e) {
      console.error('ATIS ticker overview:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const toggleTicker = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/atc/atis/ticker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !tickerVisible }),
      });
      const data = await res.json();
      if (res.ok) setTickerVisible(data.atis_ticker_visible);
    } catch (e) {
      console.error('ATIS ticker toggle:', e);
    } finally {
      setLoading(false);
    }
  };

  const showScrollingText = broadcasting && atisText && tickerVisible;

  if (!showScrollingText) {
    return (
      <div
        className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${
          isDark ? 'border-slate-800 bg-slate-950/50 backdrop-blur-md' : 'border-slate-700 bg-slate-800/50'
        }`}
      >
        <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
          {broadcasting ? (tickerVisible ? 'Chargement ATIS...' : 'Ticker ATIS masqué') : 'ATIS inactif'}
        </span>
        <button
          onClick={toggleTicker}
          disabled={loading || !broadcasting}
          className={`rounded-xl p-1.5 ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              : 'text-slate-400 hover:bg-slate-700'
          } disabled:cursor-not-allowed disabled:opacity-40`}
          title={
            broadcasting
              ? tickerVisible
                ? 'Masquer le ticker'
                : 'Afficher le ticker ATIS'
              : 'Aucun broadcast en cours'
          }
        >
          {tickerVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 overflow-hidden border-b ${
        isDark ? 'border-slate-800 bg-slate-950/55 backdrop-blur-md' : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      <div className="flex-1 min-w-0 py-2 overflow-hidden">
        <div
          className="whitespace-nowrap inline-block"
          style={{ animation: `scroll-left ${TICKER_INTERVAL_MS / 1000}s linear infinite` }}
        >
          <span className={`text-sm font-mono ${isDark ? 'text-slate-200' : 'text-slate-300'}`}>{atisText}</span>
          <span className={`mx-8 ${isDark ? 'text-sky-500/70' : 'text-slate-400'}`}> • </span>
          <span className={`text-sm font-mono ${isDark ? 'text-slate-200' : 'text-slate-300'}`}>{atisText}</span>
        </div>
      </div>
      <button
        onClick={toggleTicker}
        disabled={loading}
        className={`flex-shrink-0 rounded-xl p-2 ${
          isDark
            ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            : 'text-slate-400 hover:bg-slate-700'
        } disabled:opacity-40`}
        title="Masquer le ticker ATIS"
      >
        <EyeOff className="h-4 w-4" />
      </button>
    </div>
  );
}
