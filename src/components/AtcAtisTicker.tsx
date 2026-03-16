'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

const TICKER_INTERVAL_MS = 30000; // Répétition toutes les 30 secondes
const POLL_INTERVAL_MS = 8000;    // Rafraîchir le texte toutes les 8s

export default function AtcAtisTicker() {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [broadcasting, setBroadcasting] = useState(false);
  const [atisText, setAtisText] = useState<string | null>(null);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/atc/atis/status');
      const data = await res.json();
      if (res.ok) {
        setBroadcasting(!!data.broadcasting);
        setAtisText(data.atis_text ?? null);
        setTickerVisible(data.atis_ticker_visible ?? true);
      }
    } catch (e) {
      console.error('ATIS ticker status:', e);
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

  // Barre minimale : ATIS inactif, ou broadcast en cours mais ticker masqué
  if (!showScrollingText) {
    return (
      <div className={`flex items-center justify-between gap-2 px-4 py-2 border-b ${isDark ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/50'}`}>
        <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {broadcasting ? (tickerVisible ? 'Chargement ATIS...' : 'Ticker ATIS masqué') : 'ATIS inactif'}
        </span>
        <button
          onClick={toggleTicker}
          disabled={loading || !broadcasting}
          className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-700 text-slate-400'} disabled:opacity-40 disabled:cursor-not-allowed`}
          title={broadcasting ? (tickerVisible ? 'Masquer le ticker' : 'Afficher le ticker ATIS') : 'Aucun broadcast en cours'}
        >
          {tickerVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 border-b overflow-hidden ${isDark ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/50'}`}>
      <div className="flex-1 min-w-0 py-2 overflow-hidden">
        <div
          className="whitespace-nowrap inline-block"
          style={{ animation: `scroll-left ${TICKER_INTERVAL_MS / 1000}s linear infinite` }}
        >
          <span className={`text-sm font-mono ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
            {atisText}
          </span>
          <span className="mx-8 text-slate-400"> • </span>
          <span className={`text-sm font-mono ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
            {atisText}
          </span>
        </div>
      </div>
      <button
        onClick={toggleTicker}
        disabled={loading}
        className={`flex-shrink-0 p-2 ${isDark ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-700 text-slate-400'} disabled:opacity-40`}
        title="Masquer le ticker ATIS"
      >
        <EyeOff className="h-4 w-4" />
      </button>
    </div>
  );
}
