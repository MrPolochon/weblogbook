'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Eye, Radio, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import FlightStripBoard from '@/components/FlightStripBoard';
import type { StripData } from '@/components/FlightStrip';

interface SpectatorViewProps {
  targetUserId: string;
  targetIdentifiant: string;
  targetSession: { aeroport: string; position: string; started_at: string };
  transfertsEntrants: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[];
}

export default function SpectatorView({ targetUserId, targetIdentifiant, targetSession, transfertsEntrants }: SpectatorViewProps) {
  const [strips, setStrips] = useState<StripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAtcOnline, setIsAtcOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [session, setSession] = useState(targetSession);
  const [transfers, setTransfers] = useState(transfertsEntrants);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let controller: AbortController | null = null;
    let refreshPending = false;

    async function refresh() {
      if (controller) {
        refreshPending = true;
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch(`/api/atc/strips?observer=${encodeURIComponent(targetUserId)}`, {
          cache: 'no-store', signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 404) {
          setIsAtcOnline(false);
          setStrips([]);
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les strips.');
        if (!Array.isArray(data.strips)) throw new Error('Réponse des strips invalide.');
        setStrips(data.strips);
        if (data.observation) {
          setSession(data.observation.session);
          setTransfers(data.observation.transfers);
        }
        setIsAtcOnline(true);
        setError(null);
        setLastUpdate(new Date());
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Actualisation indisponible.');
      } finally {
        controller = null;
        if (!disposed) {
          setLoading(false);
          if (refreshPending) {
            refreshPending = false;
            void refresh();
          }
        }
      }
    }

    refreshRef.current = () => { void refresh(); };
    void refresh();
    // Listen to all plan changes so transfers away from this controller also disappear.
    const channel = supabase.channel(`spectator-${targetUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans_vol' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atc_sessions', filter: `user_id=eq.${targetUserId}` }, () => { void refresh(); })
      .subscribe();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = setInterval(refreshVisible, 10000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      disposed = true;
      controller?.abort();
      refreshRef.current = () => {};
      clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      void supabase.removeChannel(channel);
    };
  }, [targetUserId]);

  const refresh = useCallback(() => refreshRef.current(), []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/atc" aria-label="Retour au centre de contrôle" className="rounded-xl bg-slate-100 p-3 text-slate-600 hover:bg-slate-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="rounded-xl bg-sky-100 p-3 text-sky-600"><Eye className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Mode observateur</h1>
            <p className="text-sm text-slate-500">Supervision et modification des strips</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${error || !isAtcOnline ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {error || !isAtcOnline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
            {!isAtcOnline ? 'Hors service' : error ? 'Connexion à vérifier' : loading ? 'Chargement' : 'En direct'}
          </span>
          <button onClick={refresh} aria-label="Actualiser les strips" className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 text-sky-600"><Radio className="h-6 w-6" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-slate-900">{targetIdentifiant}</h2>
              <span className="rounded bg-sky-100 px-2 py-0.5 text-sm text-sky-700">{session.aeroport} · {session.position}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Clock className="h-4 w-4" />En service depuis {formatDistanceToNow(new Date(session.started_at), { locale: fr })}</p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-600"><ShieldCheck className="h-4 w-4" />Édition administrateur</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error} Les dernières données chargées restent affichées.</p>}
      {isAtcOnline && transfers.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold text-slate-900">Transferts entrants · {transfers.length}</h2>
          {transfers.map((plan) => (
            <Link key={plan.id} href={`/atc/plan/${plan.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              <span className="font-mono font-bold">{plan.numero_vol}</span>
              <span>{plan.aeroport_depart} → {plan.aeroport_arrivee}</span>
              <span>En attente d&apos;acceptation</span>
            </Link>
          ))}
        </div>
      )}
      {!isAtcOnline ? (
        <div className="card text-center"><p className="font-semibold text-slate-900">Le contrôleur a quitté son service.</p><Link href="/atc" className="mt-2 inline-block text-sky-600">Retour au centre de contrôle</Link></div>
      ) : loading ? (
        <div className="card py-10 text-center text-slate-500" role="status">Chargement des strips du contrôleur…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <p>Cliquez sur une case pour la modifier. Déplacez les strips pour les classer.</p>
            <span>{strips.length} vol{strips.length > 1 ? 's' : ''}</span>
          </div>
          <FlightStripBoard strips={strips} atcPosition={session.position} atcAeroport={session.aeroport} onRefresh={refresh} />
        </>
      )}
      {lastUpdate && <p className="text-center text-xs text-slate-500">Dernière actualisation à {lastUpdate.toLocaleTimeString('fr-FR')}. Les modifications sont enregistrées sur les strips du contrôleur observé.</p>}
    </div>
  );
}
