'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Wrench, RefreshCw, Clock } from 'lucide-react';

type MaintenanceData = {
  active: boolean;
  message: string;
  maintenance_until: string | null;
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '0 s';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s} s`;
}

function formatReturnTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MaintenancePage() {
  const [data, setData] = useState<MaintenanceData>({
    active: true,
    message: 'Le site est en cours de mise à jour. Veuillez patienter.',
    maintenance_until: null,
  });
  const [remaining, setRemaining] = useState<number | null>(null);
  const initialRemainingRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (silent = true) => {
    try {
      const res = await fetch('/api/maintenance-status', { cache: 'no-store' });
      if (!res.ok) return;
      const json: MaintenanceData = await res.json();
      // Si la maintenance est désactivée côté serveur, rediriger vers l'accueil
      if (!json.active) {
        window.location.replace('/');
        return;
      }
      setData(json);
    } catch {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // Première charge + actualisation toutes les 30 s
  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => fetchStatus(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Countdown toutes les secondes
  useEffect(() => {
    if (!data.maintenance_until) {
      setRemaining(null);
      initialRemainingRef.current = null;
      return;
    }
    const update = () => {
      const diff = new Date(data.maintenance_until!).getTime() - Date.now();
      const clamped = Math.max(0, diff);
      // On mémorise la valeur initiale pour la barre de progression
      if (initialRemainingRef.current === null && clamped > 0) {
        initialRemainingRef.current = clamped;
      }
      setRemaining(clamped);
    };
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [data.maintenance_until]);

  // Quand le countdown atteint 0, recharger
  useEffect(() => {
    if (remaining === 0) {
      const t = setTimeout(() => window.location.reload(), 2_500);
      return () => clearTimeout(t);
    }
  }, [remaining]);

  const handleRetry = () => {
    setRefreshing(true);
    window.location.reload();
  };

  const progressPct =
    remaining !== null && initialRemainingRef.current
      ? Math.max(2, Math.min(100, (1 - remaining / initialRemainingRef.current) * 100))
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#070d1a' }}>
      {/* Gradient de fond */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#070d1a] to-slate-900" />

      {/* Grille subtile */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.03,
          backgroundImage: `linear-gradient(rgba(99,179,237,0.6) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(99,179,237,0.6) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Lueurs d'ambiance */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      {/* Card principale */}
      <div className="relative z-10 w-full max-w-lg mx-4">
        <div
          className="rounded-2xl border border-slate-700/50 bg-slate-900/70 backdrop-blur-xl p-8 sm:p-10"
          style={{ boxShadow: '0 0 0 1px rgba(100,116,139,0.10), 0 25px 60px -10px rgba(0,0,0,0.75)' }}
        >
          {/* Icône animée */}
          <div className="flex justify-center mb-7">
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl border border-slate-700/60"
              style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
              <Wrench
                className="w-9 h-9 text-sky-400"
                style={{ animation: 'maintenance-rock 3s ease-in-out infinite' }}
              />
              {/* Badge clignotant */}
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-400 items-center justify-center">
                  <span className="text-[8px] font-bold text-amber-900">!</span>
                </span>
              </span>
            </div>
          </div>

          {/* Titre */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Maintenance en cours
            </h1>
            <div className="h-px w-20 mx-auto mb-4"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.6), transparent)' }} />
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {data.message}
            </p>
          </div>

          {/* Bloc ETA / Countdown */}
          {data.maintenance_until && (
            <div className="mb-6 rounded-xl border border-slate-700/40 p-4"
              style={{ background: 'rgba(15,23,42,0.6)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  Retour prévu à {formatReturnTime(data.maintenance_until)}
                </span>
              </div>

              {remaining !== null && remaining > 0 ? (
                <>
                  <div className="text-center py-1">
                    <span className="text-3xl sm:text-4xl font-mono font-bold text-white tabular-nums">
                      {formatDuration(remaining)}
                    </span>
                  </div>
                  {progressPct !== null && (
                    <div className="mt-3 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-linear"
                        style={{
                          width: `${progressPct}%`,
                          background: 'linear-gradient(90deg, #0ea5e9, #8b5cf6)',
                        }}
                      />
                    </div>
                  )}
                </>
              ) : remaining === 0 ? (
                <p className="text-center text-emerald-400 text-sm font-medium py-2 animate-pulse">
                  Maintenance terminée — rechargement en cours…
                </p>
              ) : null}
            </div>
          )}

          {/* Séparateur */}
          <div className="h-px w-full mb-6" style={{ background: 'rgba(71,85,105,0.4)' }} />

          {/* Bouton Réessayer */}
          <button
            type="button"
            onClick={handleRetry}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-semibold text-sm text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
              boxShadow: '0 4px 20px rgba(14,165,233,0.25)',
            }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Réessayer
          </button>

          <p className="mt-4 text-center text-xs text-slate-600">
            La page se rafraîchit automatiquement toutes les 30 secondes.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes maintenance-rock {
          0%, 100% { transform: rotate(-12deg); }
          50%       { transform: rotate(12deg); }
        }
      `}</style>
    </div>
  );
}
