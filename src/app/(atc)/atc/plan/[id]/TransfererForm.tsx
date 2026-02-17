'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

export default function TransfererForm({ planId, aeroportSession = '', allowAutomonitoring = true }: { planId: string; aeroportSession?: string; allowAutomonitoring?: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport, setAeroport] = useState(aeroportSession);
  const [position, setPosition] = useState('');
  const [confirmSameAirport, setConfirmSameAirport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAuto, setLoadingAuto] = useState(false);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    const apt = (aeroport || aeroportSession || '').toUpperCase();
    if (!apt) { alert('Choisissez un aéroport ou mettez-vous en service pour utiliser le vôtre.'); return; }
    if (!position) { alert('Choisissez une position.'); return; }

    const isSameAirport = !!aeroportSession && apt === (aeroportSession || '').toUpperCase();
    if (isSameAirport) {
      if (!confirmSameAirport) { alert('Cochez la confirmation pour un transfert au même aéroport.'); return; }
      if (!confirm(`Dernière confirmation : transférer vers ${position} à ${apt} (même aéroport) ?`)) return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport: apt, position }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setAeroport(aeroportSession);
      setPosition('');
      setConfirmSameAirport(false);
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutomonitoring() {
    if (!confirm('Mettre ce plan en autosurveillance ? Il sera visible par tous les ATC comme « vol non contrôlé ».') ) return;
    setLoadingAuto(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', automonitoring: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAuto(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-900">Transférer à une autre position</p>
      <p className="text-xs text-slate-600">Même aéroport (ex. IRFD Ground → Tower) : position seulement, puis double confirmation. Autre aéroport (ex. IRFD → ITKO APP) : sélectionner aéroport et position.</p>
      <form onSubmit={handleTransfer} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-0.5">Aéroport {aeroportSession && <span className="text-slate-500 font-normal">(vide = le vôtre)</span>}</label>
          <select className="input min-w-[140px]" value={aeroport} onChange={(e) => setAeroport(e.target.value)}>
            <option value="">— Choisir —</option>
            {aeroportSession && (
              <option value={aeroportSession}>Même aéroport ({aeroportSession})</option>
            )}
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-0.5">Position</label>
          <select className="input min-w-[130px]" value={position} onChange={(e) => setPosition(e.target.value)} required>
            <option value="">— Choisir —</option>
            {ATC_POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        {!!aeroportSession && (aeroport || aeroportSession || '').toUpperCase() === (aeroportSession || '').toUpperCase() && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmSameAirport} onChange={(e) => setConfirmSameAirport(e.target.checked)} className="rounded border-slate-400" />
            <span className="text-sm text-slate-800">Je confirme transférer au même aéroport ({aeroportSession})</span>
          </label>
        )}
        <button
          type="submit"
          disabled={loading || (!!aeroportSession && (aeroport || aeroportSession || '').toUpperCase() === (aeroportSession || '').toUpperCase() && !confirmSameAirport)}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? '…' : 'Transférer'}
        </button>
        {allowAutomonitoring && (
          <button type="button" onClick={handleAutomonitoring} disabled={loadingAuto || loading} className="rounded-lg border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50" title="Aucun ATC en ligne à la position cible">
            {loadingAuto ? '…' : 'Mettre en autosurveillance'}
          </button>
        )}
      </form>
    </div>
  );
}
