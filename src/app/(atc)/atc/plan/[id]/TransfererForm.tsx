'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

export default function TransfererForm({ planId }: { planId: string }) {
  const router = useRouter();
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAuto, setLoadingAuto] = useState(false);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!aeroport || !position) { alert('Choisissez un aéroport et une position.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport: aeroport.toUpperCase(), position }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setAeroport('');
      setPosition('');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutomonitoring() {
    if (!confirm('Mettre ce plan en autosurveillance ? Il sera visible par tous les ATC comme « vol non contrôlé ».') return;
    setLoadingAuto(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', automonitoring: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAuto(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-700">Transférer à une autre position (même aéroport ou autre)</p>
      <form onSubmit={handleTransfer} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Aéroport</label>
          <select className="input min-w-[140px]" value={aeroport} onChange={(e) => setAeroport(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Position</label>
          <select className="input min-w-[130px]" value={position} onChange={(e) => setPosition(e.target.value)} required>
            <option value="">— Choisir —</option>
            {ATC_POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {loading ? '…' : 'Transférer'}
        </button>
        <button type="button" onClick={handleAutomonitoring} disabled={loadingAuto || loading} className="rounded-lg border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50" title="Aucun ATC en ligne à la position cible">
          {loadingAuto ? '…' : 'Mettre en autosurveillance'}
        </button>
      </form>
    </div>
  );
}
