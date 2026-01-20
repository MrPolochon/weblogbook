'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

export default function CreateNotamForm({ variant = 'default', embedded, onSuccess }: { variant?: 'default' | 'atc'; embedded?: boolean; onSuccess?: () => void }) {
  const router = useRouter();
  const [code_aeroport, setCodeAeroport] = useState('');
  const [du_at, setDuAt] = useState('');
  const [du_time, setDuTime] = useState('');
  const [au_at, setAuAt] = useState('');
  const [au_time, setAuTime] = useState('');
  const [champ_a, setChampA] = useState('');
  const [champ_e, setChampE] = useState('');
  const [champ_d, setChampD] = useState('');
  const [champ_q, setChampQ] = useState('');
  const [priorite, setPriorite] = useState('');
  const [reference_fr, setReferenceFr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAtc = variant === 'atc';
  const label = isAtc ? 'text-slate-700' : 'text-slate-300';
  const input = 'input';

  function toUtcIso(date: string, time: string): string {
    if (!date || !time) return '';
    return `${date}T${time}:00.000Z`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = code_aeroport.trim().toUpperCase();
    if (!code) { setError('Code aéroport requis.'); return; }
    if (!du_at) { setError('Date de début (DU) requise.'); return; }
    if (!du_time) { setError('Heure de début (DU) requise.'); return; }
    if (!au_at) { setError('Date de fin (AU) requise.'); return; }
    if (!au_time) { setError('Heure de fin (AU) requise.'); return; }
    if (!champ_e.trim()) { setError('Description (champ E) requise.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/notams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_aeroport: code,
          du_at: toUtcIso(du_at, du_time),
          au_at: toUtcIso(au_at, au_time),
          champ_a: champ_a.trim() || null,
          champ_e: champ_e.trim(),
          champ_d: champ_d.trim() || null,
          champ_q: champ_q.trim() || null,
          priorite: priorite || null,
          reference_fr: reference_fr.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setCodeAeroport('');
      setDuAt('');
      setDuTime('');
      setAuAt('');
      setAuTime('');
      setChampA('');
      setChampE('');
      setChampD('');
      setChampQ('');
      setPriorite('');
      setReferenceFr('');
      onSuccess?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const wrap = embedded ? `pt-4 border-t mt-4 ${isAtc ? 'border-slate-300' : 'border-slate-600/50'}` : 'card';
  return (
    <div className={embedded ? wrap : 'card'}>
      <h2 className={`text-lg font-medium mb-4 ${isAtc ? 'text-slate-800' : 'text-slate-200'}`}>Créer un NOTAM</h2>
      <p className={`text-sm mb-4 ${isAtc ? 'text-slate-600' : 'text-slate-400'}`}>
        L&apos;identifiant est généré automatiquement : [code aéroport]-[Axxxx/AA]. Les heures sont en UTC. Champ A = lieu (code OACI ou coordonnées). Champ E = description en langage clair.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={`label ${label}`}>Code aéroport (OACI) *</label>
          <input
            list="notam-oaci"
            className={input}
            value={code_aeroport}
            onChange={(e) => setCodeAeroport(e.target.value.toUpperCase())}
            placeholder="ex. NTAA, LFPG, IRFD"
            required
          />
          <datalist id="notam-oaci">
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={`label ${label}`}>DU — Date de début (UTC) *</label>
            <input type="date" className={input} value={du_at} onChange={(e) => setDuAt(e.target.value)} required />
          </div>
          <div>
            <label className={`label ${label}`}>DU — Heure de début (UTC, HH:mm) *</label>
            <input type="time" className={input} value={du_time} onChange={(e) => setDuTime(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={`label ${label}`}>AU — Date de fin (UTC) *</label>
            <input type="date" className={input} value={au_at} onChange={(e) => setAuAt(e.target.value)} required />
          </div>
          <div>
            <label className={`label ${label}`}>AU — Heure de fin (UTC, HH:mm) *</label>
            <input type="time" className={input} value={au_time} onChange={(e) => setAuTime(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className={`label ${label}`}>A) Lieu géographique (code OACI ou coordonnées)</label>
          <input className={input} value={champ_a} onChange={(e) => setChampA(e.target.value)} placeholder="ex. NTAA ou 1733S14936W005" />
        </div>
        <div>
          <label className={`label ${label}`}>E) Description (langage clair) *</label>
          <textarea className={input} rows={4} value={champ_e} onChange={(e) => setChampE(e.target.value)} required placeholder="Ex. DREDGING OPERATIONS AT RWY 22 THRESHOLD AREA…" />
        </div>
        <div>
          <label className={`label ${label}`}>D) Horaire (ex. MON-SAT 1630-0300)</label>
          <input className={input} value={champ_d} onChange={(e) => setChampD(e.target.value)} placeholder="Optionnel" />
        </div>
        <div>
          <label className={`label ${label}`}>Q) Code Q (optionnel)</label>
          <input className={`${input} font-mono text-sm`} value={champ_q} onChange={(e) => setChampQ(e.target.value)} placeholder="ex. NTTT/QFAHW/IV/NBO/A/000/999/…" />
        </div>
        <div>
          <label className={`label ${label}`}>Priorité</label>
          <select className={input} value={priorite} onChange={(e) => setPriorite(e.target.value)}>
            <option value="">—</option>
            <option value="A">A (Immédiat)</option>
            <option value="B">B (Pertinent)</option>
            <option value="C">C (Informel)</option>
          </select>
        </div>
        <div>
          <label className={`label ${label}`}>Référence version française</label>
          <input className={input} value={reference_fr} onChange={(e) => setReferenceFr(e.target.value)} placeholder="ex. C2956/25" />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Création…' : 'Créer le NOTAM'}</button>
      </form>
    </div>
  );
}
