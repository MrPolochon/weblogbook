'use client';

import { useMemo, useState } from 'react';
import { INSTRUCTION_TITRE_TYPES } from '@/lib/licence-titres-instruction';
import {
  BookUser, Search, Shield, GraduationCap, Award, Radio, TowerControl,
  Plane,
} from 'lucide-react';

export type AnnuaireEntry = {
  id: string;
  identifiant: string;
  isAdmin: boolean;
  titres: string[];
  discord: string | null;
};

type FilterKey = 'admin' | 'FI' | 'FE' | 'ATC FI' | 'ATC FE';

const FILTERS: { key: FilterKey; label: string; icon: typeof Shield; color: string; bg: string; border: string }[] = [
  { key: 'admin', label: 'Admin', icon: Shield, color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/40' },
  { key: 'FI', label: 'FI', icon: GraduationCap, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  { key: 'FE', label: 'FE', icon: Award, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/40' },
  { key: 'ATC FI', label: 'ATC FI', icon: Radio, color: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/40' },
  { key: 'ATC FE', label: 'ATC FE', icon: TowerControl, color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/40' },
];

const BADGE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  admin: { color: 'text-violet-200', bg: 'bg-violet-500/15', border: 'border-violet-500/40' },
  FI: { color: 'text-emerald-200', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  FE: { color: 'text-amber-200', bg: 'bg-amber-500/15', border: 'border-amber-500/40' },
  'ATC FI': { color: 'text-sky-200', bg: 'bg-sky-500/15', border: 'border-sky-500/40' },
  'ATC FE': { color: 'text-rose-200', bg: 'bg-rose-500/15', border: 'border-rose-500/40' },
};

function entryMatchesFilter(entry: AnnuaireEntry, key: FilterKey): boolean {
  if (key === 'admin') return entry.isAdmin;
  return entry.titres.includes(key);
}

export default function AnnuaireClient({ entries }: { entries: AnnuaireEntry[] }) {
  const [active, setActive] = useState<Record<FilterKey, boolean>>({
    admin: true, FI: true, FE: true, 'ATC FI': true, 'ATC FE': true,
  });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const keys = (Object.keys(active) as FilterKey[]).filter((k) => active[k]);
    if (keys.length === 0) return [];
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => keys.some((k) => entryMatchesFilter(e, k)))
      .filter((e) => !q || e.identifiant.toLowerCase().includes(q) || (e.discord && e.discord.toLowerCase().includes(q)))
      .sort((a, b) => a.identifiant.localeCompare(b.identifiant, 'fr'));
  }, [entries, active, search]);

  const countByFilter = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of FILTERS) {
      m[f.key] = entries.filter((e) => entryMatchesFilter(e, f.key)).length;
    }
    return m;
  }, [entries]);

  return (
    <div className="space-y-6 animate-page-reveal max-w-5xl mx-auto w-full">
      {/* ===== HUD Header ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-sky-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/20">
              <BookUser className="h-7 w-7 text-sky-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Annuaire</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Instructeurs, examinateurs et administrateurs — {entries.length} membre{entries.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {FILTERS.map((f) => (
              <div key={f.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${f.bg} border ${f.border}`}>
                <f.icon className={`h-3.5 w-3.5 ${f.color}`} />
                <span className={`${f.color} font-medium`}>{countByFilter[f.key]} {f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Search + Filters ===== */}
      <div className="card space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            className="input w-full pl-10"
            placeholder="Rechercher par identifiant ou Discord..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const isActive = active[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setActive((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  isActive
                    ? `${f.bg} ${f.border} ${f.color}`
                    : 'border-slate-700/40 text-slate-500 bg-slate-800/20 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/10' : 'bg-slate-700/60'}`}>
                  {countByFilter[f.key]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          {filtered.length} personne{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
          {search.trim() && ` pour « ${search.trim()} »`}
        </p>
      </div>

      {/* ===== Directory Grid ===== */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 space-y-3">
          <BookUser className="h-10 w-10 text-slate-600" />
          <p className="text-slate-500 text-sm">
            {entries.length === 0
              ? 'Aucune entrée dans l\u2019annuaire.'
              : 'Aucun résultat — élargissez les filtres ou modifiez la recherche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-enter">
          {filtered.map((e) => {
            const primaryBadge = e.isAdmin ? BADGE_STYLE.admin : (e.titres.length > 0 ? BADGE_STYLE[e.titres[0]] : null);
            const avatarBg = primaryBadge ? primaryBadge.bg : 'bg-slate-700/40';
            const avatarColor = primaryBadge ? primaryBadge.color : 'text-slate-400';
            return (
              <div
                key={e.id}
                className="group rounded-xl border border-slate-700/50 bg-slate-800/20 p-4 space-y-3 transition-all duration-200 hover:border-slate-600/60 hover:bg-slate-800/30 hover:shadow-lg hover:shadow-slate-900/30"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${avatarBg} ${avatarColor} font-bold text-sm shrink-0`}>
                    {e.identifiant[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100 truncate">{e.identifiant}</p>
                    {e.discord ? (
                      <p className="text-xs text-slate-400 truncate">{e.discord}</p>
                    ) : (
                      <p className="text-xs text-slate-600 italic">Pas de Discord</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {e.isAdmin && (
                    <span className={`inline-flex items-center gap-1 rounded-full border ${BADGE_STYLE.admin.border} ${BADGE_STYLE.admin.bg} px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLE.admin.color}`}>
                      <Shield className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                  {INSTRUCTION_TITRE_TYPES.map((t) =>
                    e.titres.includes(t) ? (
                      <span
                        key={t}
                        className={`inline-flex items-center gap-1 rounded-full border ${BADGE_STYLE[t]?.border || ''} ${BADGE_STYLE[t]?.bg || ''} px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLE[t]?.color || ''}`}
                      >
                        {t}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
