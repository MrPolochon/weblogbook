'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import {
  checkAtcAccess,
  isAirportSelectable,
  type AtcAirportOption,
  type AtcAccessContext,
} from '@/lib/atc-grade-restrictions';
import { MapPin, Radio, Loader2 } from 'lucide-react';

type Props = {
  accessContext: AtcAccessContext;
  airportOptions: AtcAirportOption[];
};

export default function SeMettreEnServiceForm({ accessContext, airportOptions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const airportChoices = useMemo(() => {
    return airportOptions.map((a) => {
      const selectable = isAirportSelectable(a.code, accessContext);
      let reason: string | undefined;
      if (!selectable && !accessContext.bypass) {
        const firstBlocked = ATC_POSITIONS.map((p) => checkAtcAccess(a.code, p, accessContext)).find((r) => !r.allowed);
        reason = firstBlocked && !firstBlocked.allowed ? firstBlocked.reason : 'Non autorisé pour votre grade';
      }
      return { ...a, selectable, reason };
    });
  }, [accessContext, airportOptions]);

  const positionOptions = useMemo(() => {
    if (!aeroport) return [];
    return ATC_POSITIONS.map((p) => {
      const result = checkAtcAccess(aeroport, p, accessContext);
      return {
        position: p,
        allowed: result.allowed,
        reason: result.allowed ? undefined : result.reason,
      };
    });
  }, [aeroport, accessContext]);

  function handleAeroportChange(code: string) {
    setAeroport(code);
    setPosition('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!aeroport || !position) {
      setError('Sélectionnez l\'aéroport et la position.');
      return;
    }
    const access = checkAtcAccess(aeroport, position, accessContext);
    if (!access.allowed) {
      setError(access.reason);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aeroport, position }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const hasAnyAirport = airportChoices.some((a) => a.selectable);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!accessContext.bypass && accessContext.userGrade && (
        <div className="space-y-1">
          <p className="text-sm text-slate-400">
            Grade : <span className="font-semibold text-slate-200">{accessContext.userGrade.nom}</span>
          </p>
          <p className="text-xs text-slate-500">
            Les aéroports et positions indisponibles sont masqués selon vos règles de grade.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-400" />
            Aéroport
          </label>
          <select
            className="input w-full font-mono"
            value={aeroport}
            onChange={(e) => handleAeroportChange(e.target.value)}
            required
            disabled={!hasAnyAirport}
          >
            <option value="">— Sélectionner —</option>
            {airportChoices.map((a) => (
              <option key={a.code} value={a.code} disabled={!a.selectable} title={a.reason}>
                {a.selectable ? a.label : `${a.label} (non autorisé)`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            Position
          </label>
          <select
            className="input w-full"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            required
            disabled={!aeroport}
          >
            <option value="">— Sélectionner —</option>
            {positionOptions.map((p) => (
              <option key={p.position} value={p.position} disabled={!p.allowed} title={p.reason}>
                {p.allowed ? p.position : `${p.position} (non autorisé)`}
              </option>
            ))}
          </select>
          {aeroport && positionOptions.every((p) => !p.allowed) && (
            <p className="text-amber-400 text-xs mt-1">
              Aucune position disponible sur {aeroport} pour votre grade.
            </p>
          )}
        </div>
      </div>

      {!hasAnyAirport && !accessContext.bypass && (
        <p className="text-amber-400 text-sm">Aucun aéroport disponible pour votre grade actuel.</p>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-800">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 w-full sm:w-auto"
        disabled={loading || !aeroport || !position || !hasAnyAirport}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Mise en service...
          </>
        ) : (
          <>
            <Radio className="h-4 w-4" />
            Ouvrir la console
          </>
        )}
      </button>
    </form>
  );
}
