'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, ShieldBan, ShieldCheck } from 'lucide-react';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import {
  type AtcAirportOption,
  formatForbiddenLabel,
  formatMinGradeLabel,
  type AtcGradeForbidden,
  type AtcGradeInfo,
  type AtcPositionMinGrade,
} from '@/lib/atc-grade-restrictions';

type Props = {
  grades: AtcGradeInfo[];
  airportOptions: AtcAirportOption[];
  forbidden: AtcGradeForbidden[];
  minGrades: AtcPositionMinGrade[];
};

const TARGET_KINDS = [
  { value: 'airport', label: 'Aéroport entier' },
  { value: 'position', label: 'Position (tous aéroports)' },
  { value: 'pair', label: 'Aéroport + position' },
] as const;

export default function AdminAtcAccessRules({ grades, airportOptions, forbidden, minGrades }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [forbidGradeId, setForbidGradeId] = useState('');
  const [forbidKind, setForbidKind] = useState<'airport' | 'position' | 'pair'>('airport');
  const [forbidAeroport, setForbidAeroport] = useState('');
  const [forbidPosition, setForbidPosition] = useState('');
  const [forbidLower, setForbidLower] = useState(true);

  const [minGradeId, setMinGradeId] = useState('');
  const [minKind, setMinKind] = useState<'airport' | 'position' | 'pair'>('pair');
  const [minAeroport, setMinAeroport] = useState('');
  const [minPosition, setMinPosition] = useState('');

  async function addForbidden(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/atc/forbidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade_id: forbidGradeId,
          kind: forbidKind,
          aeroport: forbidKind !== 'position' ? forbidAeroport : null,
          position: forbidKind !== 'airport' ? forbidPosition : null,
          applies_to_lower_grades: forbidLower,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setForbidAeroport('');
      setForbidPosition('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function addMinGrade(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/atc/min-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_grade_id: minGradeId,
          kind: minKind,
          aeroport: minKind !== 'position' ? minAeroport : null,
          position: minKind !== 'airport' ? minPosition : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setMinAeroport('');
      setMinPosition('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function removeForbidden(id: string) {
    if (!confirm('Supprimer cette interdiction ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/atc/forbidden/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function removeMinGrade(id: string) {
    if (!confirm('Supprimer cette exigence de grade ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/atc/min-grades/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  if (grades.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-medium text-slate-800 mb-2">Règles d&apos;accès aux positions</h2>
        <p className="text-slate-600 text-sm">Créez d&apos;abord des grades ATC.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-lg font-medium text-slate-800 mb-1">Règles d&apos;accès aux positions</h2>
        <p className="text-slate-600 text-sm mb-2">
          Deux types de règles coexistent : une <span className="font-medium">interdiction</span> bloque totalement une cible,
          tandis qu&apos;un <span className="font-medium">grade minimum</span> autorise seulement les grades suffisants.
          Rang 1 = grade le plus bas.
        </p>
        <p className="text-slate-500 text-xs">
          Les listes d&apos;aéroports réutilisent désormais le catalogue ATC du site et incluent aussi les codes déjà présents
          dans les fréquences, sessions ou règles existantes.
        </p>
      </div>

      {/* Interdictions */}
      <section>
        <h3 className="text-base font-medium text-slate-800 mb-2 flex items-center gap-2">
          <ShieldBan className="h-4 w-4 text-red-500" />
          Interdictions par grade
        </h3>
        <ul className="space-y-2 mb-4">
          {forbidden.length === 0 && <li className="text-slate-500 text-sm">Aucune interdiction configurée.</li>}
          {forbidden.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 text-sm">
              <span className="text-slate-700">{formatForbiddenLabel(r)}</span>
              <button type="button" onClick={() => removeForbidden(r.id)} disabled={loading} className="text-red-500 hover:text-red-700 p-1" title="Supprimer">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addForbidden} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="label text-xs">Grade concerné</label>
            <select className="input" value={forbidGradeId} onChange={(e) => setForbidGradeId(e.target.value)} required>
              <option value="">— Grade —</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.nom} (rang {g.ordre})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Portée</label>
            <select className="input" value={forbidKind} onChange={(e) => setForbidKind(e.target.value as typeof forbidKind)}>
              {TARGET_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          {forbidKind !== 'position' && (
            <div>
              <label className="label text-xs">Aéroport</label>
              <select className="input font-mono" value={forbidAeroport} onChange={(e) => setForbidAeroport(e.target.value)} required>
                <option value="">—</option>
                {airportOptions.map((a) => (
                  <option key={a.code} value={a.code}>{a.label}</option>
                ))}
              </select>
            </div>
          )}
          {forbidKind !== 'airport' && (
            <div>
              <label className="label text-xs">Position</label>
              <select className="input" value={forbidPosition} onChange={(e) => setForbidPosition(e.target.value)} required>
                <option value="">—</option>
                {ATC_POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
            <input type="checkbox" checked={forbidLower} onChange={(e) => setForbidLower(e.target.checked)} />
            Grades inférieurs aussi
          </label>
          <button type="submit" className="btn-primary" disabled={loading || !forbidGradeId}>Ajouter</button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Exemple : interdire `Tower` sur `IRFD` pour `CAT 1` et inférieur, ou interdire `Center` pour un grade précis uniquement.
        </p>
      </section>

      {/* Grade minimum */}
      <section>
        <h3 className="text-base font-medium text-slate-800 mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Grade minimum requis
        </h3>
        <ul className="space-y-2 mb-4">
          {minGrades.length === 0 && <li className="text-slate-500 text-sm">Aucune exigence configurée.</li>}
          {minGrades.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 text-sm">
              <span className="text-slate-700">{formatMinGradeLabel(r)}</span>
              <button type="button" onClick={() => removeMinGrade(r.id)} disabled={loading} className="text-red-500 hover:text-red-700 p-1" title="Supprimer">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addMinGrade} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="label text-xs">Grade minimum</label>
            <select className="input" value={minGradeId} onChange={(e) => setMinGradeId(e.target.value)} required>
              <option value="">— Grade —</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.nom} (rang {g.ordre})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Portée</label>
            <select className="input" value={minKind} onChange={(e) => setMinKind(e.target.value as typeof minKind)}>
              {TARGET_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          {minKind !== 'position' && (
            <div>
              <label className="label text-xs">Aéroport</label>
              <select className="input font-mono" value={minAeroport} onChange={(e) => setMinAeroport(e.target.value)} required>
                <option value="">—</option>
                {airportOptions.map((a) => (
                  <option key={a.code} value={a.code}>{a.label}</option>
                ))}
              </select>
            </div>
          )}
          {minKind !== 'airport' && (
            <div>
              <label className="label text-xs">Position</label>
              <select className="input" value={minPosition} onChange={(e) => setMinPosition(e.target.value)} required>
                <option value="">—</option>
                {ATC_POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={loading || !minGradeId}>Ajouter</button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Exemple : exiger `CAT 3` minimum pour `Tower` sur `IRFD`, sans forcément interdire les autres positions de cet aéroport.
        </p>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
