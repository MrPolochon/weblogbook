'use client';

import { useMemo, useState } from 'react';
import { INSTRUCTION_TITRE_TYPES } from '@/lib/licence-titres-instruction';

export type AnnuaireEntry = {
  id: string;
  identifiant: string;
  isAdmin: boolean;
  /** Titres instruction présents (FI, FE, ATC FI, ATC FE) */
  titres: string[];
  discord: string | null;
};

const FILTERS = {
  admin: { label: 'Administrateurs' },
  FI: { label: 'FI' },
  FE: { label: 'FE' },
  'ATC FI': { label: 'ATC FI' },
  'ATC FE': { label: 'ATC FE' },
} as const;

type FilterKey = keyof typeof FILTERS;

const DEFAULT_ACTIVE: Record<FilterKey, boolean> = {
  admin: true,
  FI: true,
  FE: true,
  'ATC FI': true,
  'ATC FE': true,
};

function entryMatchesFilter(entry: AnnuaireEntry, key: FilterKey): boolean {
  if (key === 'admin') return entry.isAdmin;
  return entry.titres.includes(key);
}

export default function AnnuaireClient({ entries }: { entries: AnnuaireEntry[] }) {
  const [active, setActive] = useState<Record<FilterKey, boolean>>({ ...DEFAULT_ACTIVE });

  const filtered = useMemo(() => {
    const keys = (Object.keys(FILTERS) as FilterKey[]).filter((k) => active[k]);
    if (keys.length === 0) return [];
    return entries
      .filter((e) => keys.some((k) => entryMatchesFilter(e, k)))
      .sort((a, b) => a.identifiant.localeCompare(b.identifiant, 'fr'));
  }, [entries, active]);

  function toggle(key: FilterKey) {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold text-slate-100">Annuaire</h1>
        <p className="text-sm text-slate-400">
          Instructeurs, examinateurs, titres ATC instruction et administrateurs. Pseudo Discord d’après le compte
          lié (OAuth).
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-medium text-slate-300">Filtres (affichage = personnes correspondant à l’un des
          rôles cochés)</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <label
              key={key}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 cursor-pointer hover:border-slate-500"
            >
              <input
                type="checkbox"
                className="rounded border-slate-500"
                checked={active[key]}
                onChange={() => toggle(key)}
              />
              {FILTERS[key].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {Object.values(active).every(Boolean)
            ? 'Tous les filtres actifs — liste complète.'
            : `${filtered.length} personne(s) affichée(s).`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">
            {entries.length === 0
              ? 'Aucune entrée dans l’annuaire.'
              : 'Aucun résultat : cochez au moins un filtre ou élargissez la sélection.'}
          </p>
        ) : (
          <table className="w-full text-sm text-left min-w-[28rem]">
            <thead>
              <tr className="border-b border-slate-700/60 text-slate-400">
                <th className="py-2 pr-3 font-medium">Identifiant</th>
                <th className="py-2 pr-3 font-medium">Discord</th>
                <th className="py-2 font-medium">Statut / titres</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/80 text-slate-200 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-slate-100">{e.identifiant}</td>
                  <td className="py-2.5 pr-3 text-slate-300">{e.discord || '—'}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {e.isAdmin && (
                        <span className="inline-flex rounded border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">
                          Admin
                        </span>
                      )}
                      {INSTRUCTION_TITRE_TYPES.map((t) =>
                        e.titres.includes(t) ? (
                          <span
                            key={t}
                            className="inline-flex rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200"
                          >
                            {t}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
