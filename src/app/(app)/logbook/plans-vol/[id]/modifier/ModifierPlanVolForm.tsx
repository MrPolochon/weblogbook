'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type Plan = {
  id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  numero_vol: string;
  porte: string | null;
  temps_prev_min: number;
  type_vol: 'VFR' | 'IFR';
  intentions_vol: string | null;
  sid_depart: string | null;
  star_arrivee: string | null;
  refusal_reason: string | null;
};

export default function ModifierPlanVolForm({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [aeroport_depart, setAeroportDepart] = useState(plan.aeroport_depart || '');
  const [aeroport_arrivee, setAeroportArrivee] = useState(plan.aeroport_arrivee || '');
  const [numero_vol, setNumeroVol] = useState(plan.numero_vol || '');
  const [porte, setPorte] = useState(plan.porte || '');
  const [temps_prev_min, setTempsPrevMin] = useState(String(plan.temps_prev_min || ''));
  const [type_vol, setTypeVol] = useState<'VFR' | 'IFR'>(plan.type_vol || 'VFR');
  const [intentions_vol, setIntentionsVol] = useState(plan.intentions_vol || '');
  const [sid_depart, setSidDepart] = useState(plan.sid_depart || '');
  const [star_arrivee, setStarArrivee] = useState(plan.star_arrivee || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);

  async function submitPlan(volSansAtc: boolean) {
    const t = parseInt(temps_prev_min, 10);
    const res = await fetch(`/api/plans-vol/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'modifier_et_renvoyer',
        aeroport_depart,
        aeroport_arrivee,
        numero_vol: numero_vol.trim(),
        porte: porte.trim() || undefined,
        temps_prev_min: t,
        type_vol,
        intentions_vol: type_vol === 'VFR' ? intentions_vol.trim() : undefined,
        sid_depart: type_vol === 'IFR' ? sid_depart.trim() : undefined,
        star_arrivee: type_vol === 'IFR' ? star_arrivee.trim() : undefined,
        vol_sans_atc: volSansAtc,
      }),
    });
    return res;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowNoAtcConfirm(false);
    const t = parseInt(temps_prev_min, 10);
    if (!aeroport_depart || !aeroport_arrivee || !numero_vol.trim() || isNaN(t) || t < 1 || !type_vol) {
      setError('Remplissez tous les champs requis.');
      return;
    }
    if (type_vol === 'VFR' && !intentions_vol.trim()) { setError('Intentions de vol requises pour VFR.'); return; }
    if (type_vol === 'IFR' && (!sid_depart.trim() || !star_arrivee.trim())) { setError('SID de départ et STAR d\'arrivée requises pour IFR.'); return; }
    setLoading(true);
    try {
      const res = await submitPlan(false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error && String(data.error).includes('Aucune frequence ATC')) {
        setShowNoAtcConfirm(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push('/logbook/plans-vol');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitSansAtc() {
    setError(null);
    setShowNoAtcConfirm(false);
    setLoading(true);
    try {
      const res = await submitPlan(true);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push('/logbook/plans-vol');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      {plan.refusal_reason && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm font-medium text-red-200">Raison du refus par l&apos;ATC</p>
          <p className="text-sm text-red-100/90 mt-1">{plan.refusal_reason}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Numéro de vol *</label>
          <input type="text" className="input" value={numero_vol} onChange={(e) => setNumeroVol(e.target.value)} required />
        </div>
        <div>
          <label className="label">Porte</label>
          <input type="text" className="input" value={porte} onChange={(e) => setPorte(e.target.value)} placeholder="Optionnel" />
        </div>
      </div>
      <div>
        <label className="label">Temps de vol prévu (minutes) *</label>
        <input type="number" className="input w-32" value={temps_prev_min} onChange={(e) => setTempsPrevMin(e.target.value)} min={1} required />
      </div>
      <div>
        <span className="label block">Type de vol *</span>
        <div className="flex gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'VFR'} onChange={() => setTypeVol('VFR')} />
            <span className="text-slate-300">VFR</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'IFR'} onChange={() => setTypeVol('IFR')} />
            <span className="text-slate-300">IFR</span>
          </label>
        </div>
      </div>
      {type_vol === 'VFR' && (
        <div>
          <label className="label">Intentions de vol *</label>
          <textarea className="input min-h-[80px]" value={intentions_vol} onChange={(e) => setIntentionsVol(e.target.value)} required />
        </div>
      )}
      {type_vol === 'IFR' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">SID de départ *</label>
            <input type="text" className="input" value={sid_depart} onChange={(e) => setSidDepart(e.target.value)} required />
          </div>
          <div>
            <label className="label">STAR d&apos;arrivée *</label>
            <input type="text" className="input" value={star_arrivee} onChange={(e) => setStarArrivee(e.target.value)} required />
          </div>
        </div>
      )}
      {showNoAtcConfirm && (
        <div className="p-4 rounded-lg border-2 border-amber-500 bg-amber-500/20 space-y-3">
          <p className="font-semibold text-amber-200">Aucun ATC en ligne</p>
          <p className="text-sm text-amber-300/80">
            Aucun contrôleur n&apos;est disponible pour votre départ ou arrivée. Voulez-vous envoyer ce plan en autosurveillance ?
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmitSansAtc}
              disabled={loading}
              className="btn-primary bg-amber-600 hover:bg-amber-700"
            >
              {loading ? 'Envoi...' : 'Oui, voler sans ATC'}
            </button>
            <button
              type="button"
              onClick={() => setShowNoAtcConfirm(false)}
              className="btn-secondary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Envoi…' : 'Modifier et renvoyer'}</button>
    </form>
  );
}
