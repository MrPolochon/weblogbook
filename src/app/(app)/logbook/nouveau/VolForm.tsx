'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Compagnie = { id: string; nom: string };

export default function VolForm({
  typesAvion,
  compagnies,
}: {
  typesAvion: TypeAvion[];
  compagnies: Compagnie[];
}) {
  const router = useRouter();
  const [type_avion_id, setTypeAvionId] = useState('');
  const [compagnie_id, setCompagnieId] = useState('');
  const [pourMoiMemo, setPourMoiMemo] = useState(false);
  const [duree_minutes, setDureeMinutes] = useState('');
  const [depart_utc, setDepartUtc] = useState('');
  const [type_vol, setTypeVol] = useState<'IFR' | 'VFR'>('VFR');
  const [commandant_bord, setCommandantBord] = useState('');
  const [role_pilote, setRolePilote] = useState<'Pilote' | 'Co-pilote'>('Pilote');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compagnieLibelle = pourMoiMemo ? 'Pour moi-même' : (compagnies.find((c) => c.id === compagnie_id)?.nom ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = parseInt(duree_minutes, 10);
    if (!type_avion_id || (!pourMoiMemo && !compagnie_id) || isNaN(d) || d < 1 || !depart_utc || !commandant_bord.trim()) {
      setError('Veuillez remplir tous les champs requis.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/vols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id,
          compagnie_id: pourMoiMemo ? null : compagnie_id,
          compagnie_libelle: pourMoiMemo ? 'Pour moi-même' : compagnieLibelle,
          duree_minutes: d,
          depart_utc: depart_utc,
          type_vol,
          commandant_bord: commandant_bord.trim(),
          role_pilote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push('/logbook');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      <div>
        <label className="label">Type d&apos;avion *</label>
        <select
          className="input"
          value={type_avion_id}
          onChange={(e) => setTypeAvionId(e.target.value)}
          required
        >
          <option value="">— Choisir —</option>
          {typesAvion.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom} {t.constructeur ? `(${t.constructeur})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Compagnie aérienne *</label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            id="moi"
            checked={pourMoiMemo}
            onChange={(e) => { setPourMoiMemo(e.target.checked); if (e.target.checked) setCompagnieId(''); }}
          />
          <label htmlFor="moi" className="text-sm text-slate-300">Pour moi-même</label>
        </div>
        {!pourMoiMemo && (
          <select
            className="input"
            value={compagnie_id}
            onChange={(e) => setCompagnieId(e.target.value)}
            required
          >
            <option value="">— Choisir —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Durée (minutes) *</label>
          <input
            type="number"
            className="input"
            value={duree_minutes}
            onChange={(e) => setDureeMinutes(e.target.value)}
            min={1}
            required
          />
        </div>
        <div>
          <label className="label">Heure de départ (UTC) *</label>
          <input
            type="datetime-local"
            className="input"
            value={depart_utc}
            onChange={(e) => setDepartUtc(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Type de vol *</label>
          <select className="input" value={type_vol} onChange={(e) => setTypeVol(e.target.value as 'IFR' | 'VFR')}>
            <option value="VFR">VFR</option>
            <option value="IFR">IFR</option>
          </select>
        </div>
        <div>
          <label className="label">Rôle *</label>
          <select className="input" value={role_pilote} onChange={(e) => setRolePilote(e.target.value as 'Pilote' | 'Co-pilote')}>
            <option value="Pilote">Pilote</option>
            <option value="Co-pilote">Co-pilote</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Nom / pseudo du commandant de bord *</label>
        <input
          type="text"
          className="input"
          value={commandant_bord}
          onChange={(e) => setCommandantBord(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Envoi…' : 'Soumettre'}
      </button>
    </form>
  );
}
