'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { INSTRUCTION_TITRE_TYPES } from '@/lib/licence-titres-instruction';
import {
  Award, BookUser, Check, Copy, GraduationCap, Mail, Radio, Search,
  Shield, SlidersHorizontal, TowerControl, UsersRound, X,
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

export type AnnuaireEntry = {
  id: string;
  identifiant: string;
  isAdmin: boolean;
  titres: string[];
  discord: string | null;
  /** Photo officielle issue de la carte d'identite (cartes_identite.photo_url). */
  photoUrl: string | null;
  /** Vrai si l'instructeur s'est mis indisponible. */
  indisponible: boolean;
};

type FilterKey = 'admin' | 'FI' | 'FE' | 'ATC FI' | 'ATC FE';

const FILTERS: { key: FilterKey; label: string; icon: typeof Shield; color: string; selected: string }[] = [
  { key: 'admin', label: 'Administration', icon: Shield, color: 'text-violet-300', selected: 'border-violet-400/40 bg-violet-400/10' },
  { key: 'FI', label: 'Instructeurs', icon: GraduationCap, color: 'text-emerald-300', selected: 'border-emerald-400/40 bg-emerald-400/10' },
  { key: 'FE', label: 'Examinateurs', icon: Award, color: 'text-amber-300', selected: 'border-amber-400/40 bg-amber-400/10' },
  { key: 'ATC FI', label: 'Instructeurs ATC', icon: Radio, color: 'text-sky-300', selected: 'border-sky-400/40 bg-sky-400/10' },
  { key: 'ATC FE', label: 'Examinateurs ATC', icon: TowerControl, color: 'text-rose-300', selected: 'border-rose-400/40 bg-rose-400/10' },
];

const BADGE_STYLE: Record<string, string> = {
  admin: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
  FI: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  FE: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  'ATC FI': 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  'ATC FE': 'border-rose-400/25 bg-rose-400/10 text-rose-200',
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyDiscord(id: string, discord: string) {
    try {
      await navigator.clipboard.writeText(discord);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1800);
    } catch {
      setCopiedId(null);
    }
  }

  const filtered = useMemo(() => {
    const keys = (Object.keys(active) as FilterKey[]).filter((key) => active[key]);
    const query = search.trim().toLocaleLowerCase('fr');
    return entries
      .filter((entry) => keys.some((key) => entryMatchesFilter(entry, key)))
      .filter((entry) =>
        !query ||
        entry.identifiant.toLocaleLowerCase('fr').includes(query) ||
        (entry.discord?.toLocaleLowerCase('fr').includes(query) ?? false),
      )
      .sort((a, b) => a.identifiant.localeCompare(b.identifiant, 'fr'));
  }, [entries, active, search]);

  const countByFilter = useMemo(() => {
    const counts: Record<FilterKey, number> = { admin: 0, FI: 0, FE: 0, 'ATC FI': 0, 'ATC FE': 0 };
    for (const entry of entries) {
      for (const filter of FILTERS) {
        if (entryMatchesFilter(entry, filter.key)) counts[filter.key] += 1;
      }
    }
    return counts;
  }, [entries]);
  const availableInstructors = entries.filter(
    (entry) => (entry.titres.includes('FI') || entry.titres.includes('FE')) && !entry.indisponible,
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 animate-page-reveal">
      <section className="relative isolate overflow-hidden rounded-3xl border border-sky-400/15 bg-slate-950 shadow-[0_24px_70px_rgba(2,6,23,0.42)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-40" />
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-44 left-1/3 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">
              <BookUser className="h-3.5 w-3.5" />
              Répertoire officiel
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Annuaire du personnel</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Retrouvez les équipes d’encadrement, les examinateurs et les responsables de l’administration.
            </p>
          </div>
          <div className="flex gap-3 lg:min-w-64">
            <div className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums text-white">{entries.length}</p>
              <p className="mt-1 text-xs text-slate-500">personnes référencées</p>
            </div>
            <div className="flex-1 rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.035] px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums text-emerald-200">{availableInstructors}</p>
              <p className="mt-1 text-xs text-slate-500">instructeurs disponibles</p>
            </div>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] px-6 py-3.5 sm:px-8 lg:px-10">
          {FILTERS.map((filter) => (
            <span key={filter.key} className="inline-flex items-center gap-2 text-xs text-slate-400">
              <filter.icon className={`h-3.5 w-3.5 ${filter.color}`} />
              {filter.label}
              <span className="font-semibold tabular-nums text-slate-200">{countByFilter[filter.key]}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/10 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher un membre ou un compte Discord</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              className="input h-11 w-full rounded-xl border-slate-700/80 bg-slate-950/60 pl-10 pr-10 text-sm placeholder:text-slate-600 focus:border-sky-400/50"
              placeholder="Identifiant ou nom Discord"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <SlidersHorizontal className="h-4 w-4" />
            Filtrer par fonction
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const Icon = filter.icon;
            const selected = active[filter.key];
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setActive((current) => ({ ...current, [filter.key]: !current[filter.key] }))}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${selected ? `${filter.selected} ${filter.color}` : 'border-slate-700/70 bg-slate-950/30 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {filter.label}
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${selected ? 'bg-black/20' : 'bg-slate-800 text-slate-400'}`}>
                  {countByFilter[filter.key]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Membres</h2>
          <p className="mt-0.5 text-xs text-slate-500">Résultats correspondant à votre recherche et aux filtres.</p>
        </div>
        <p className="shrink-0 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs tabular-nums text-slate-400">
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
            <UsersRound className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-slate-200">
            {entries.length === 0 ? 'Annuaire en préparation' : 'Aucun membre trouvé'}
          </h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
            {entries.length === 0
              ? 'Les profils du personnel apparaîtront ici dès qu’ils seront référencés.'
              : 'Modifiez votre recherche ou réactivez une fonction pour voir plus de membres.'}
          </p>
          {(search || !Object.values(active).some(Boolean)) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActive({ admin: true, FI: true, FE: true, 'ATC FI': true, 'ATC FE': true });
              }}
              className="mt-4 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => {
            const unavailable = entry.indisponible;
            const hasInstructionRole = entry.titres.some((title) => title === 'FI' || title === 'FE');
            return (
              <article
                key={entry.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/25 hover:bg-slate-900 hover:shadow-xl hover:shadow-slate-950/60"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start gap-3.5">
                  <UserAvatar identifiant={entry.identifiant} photoUrl={entry.photoUrl} size="lg" className="shrink-0 ring-1 ring-white/10" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="truncate text-sm font-semibold text-white">{entry.identifiant}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {entry.discord ? `@${entry.discord}` : 'Compte Discord non renseigné'}
                    </p>
                  </div>
                  {unavailable ? (
                    <span className="shrink-0 rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-2.5 py-1 text-[10px] font-medium text-amber-200/80">
                      Indisponible en instruction
                    </span>
                  ) : hasInstructionRole ? (
                    <span className="shrink-0 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-200/80">
                      Disponible
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 min-h-7 border-t border-white/[0.06] pt-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    {entry.isAdmin && (
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${BADGE_STYLE.admin}`}>
                        <Shield className="h-3 w-3" />
                        Administration
                      </span>
                    )}
                    {INSTRUCTION_TITRE_TYPES.map((title) =>
                      entry.titres.includes(title) ? (
                        <span key={title} className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-medium ${BADGE_STYLE[title] ?? 'border-slate-700 bg-slate-800 text-slate-300'}`}>
                          {title}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3.5">
                  <Link
                    href={`/messagerie?to=${encodeURIComponent(entry.identifiant)}`}
                    aria-disabled={unavailable}
                    tabIndex={unavailable ? -1 : undefined}
                    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${unavailable ? 'pointer-events-none border-slate-800 bg-slate-950/30 text-slate-600' : 'border-sky-300/15 bg-sky-300/[0.06] text-sky-200 hover:border-sky-300/30 hover:bg-sky-300/10'}`}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Envoyer un message
                  </Link>
                  <button
                    type="button"
                    onClick={() => entry.discord && copyDiscord(entry.id, entry.discord)}
                    disabled={!entry.discord || unavailable}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                    title={entry.discord ? `Copier le compte Discord ${entry.discord}` : 'Compte Discord non renseigné'}
                  >
                    {copiedId === entry.id
                      ? <><Check className="h-3.5 w-3.5 text-emerald-300" /> Copié</>
                      : <><Copy className="h-3.5 w-3.5" /> Copier Discord</>}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
