'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import AdminFelitzClient from './AdminFelitzClient';

interface CompteEntry {
  id: string;
  vban: string;
  solde: number;
  label: string;
}

interface Props {
  comptes: CompteEntry[];
  type: 'personnel' | 'entreprise' | 'militaire' | 'alliance' | 'reparation';
  searchPlaceholder?: string;
}

export default function AdminFelitzSection({ comptes, type, searchPlaceholder = 'Rechercher...' }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return comptes;
    return comptes.filter((c) =>
      c.label.toLowerCase().includes(q) || c.vban.toLowerCase().includes(q),
    );
  }, [comptes, query]);

  const totalSolde = useMemo(
    () => filtered.reduce((sum, c) => sum + (Number(c.solde) || 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="input w-full pl-8 text-sm"
          />
        </div>
        <div className="text-xs text-slate-400 font-mono whitespace-nowrap">
          {filtered.length} / {comptes.length} • <span className="text-slate-200 font-semibold">{totalSolde.toLocaleString('fr-FR')} F$</span>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-4">Aucun compte trouvé</p>
        ) : (
          filtered.map((c) => (
            <AdminFelitzClient
              key={c.id}
              compte={{ id: c.id, vban: c.vban, solde: c.solde }}
              label={c.label}
              type={type}
            />
          ))
        )}
      </div>
    </div>
  );
}
