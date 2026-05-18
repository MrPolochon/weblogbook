'use client';

import { useMemo, useState } from 'react';
import { Plus, AlertTriangle, Clock, CheckCircle2, Layers, Search, X } from 'lucide-react';
import CreateNotamForm from './CreateNotamForm';
import NotamCard from './NotamCard';
import NotamDeleteButton from './NotamDeleteButton';
import NotamsMap, { type NotamLite } from './NotamsMap';
import AirportNotamsModal from './AirportNotamsModal';

type Notam = {
  id: string;
  identifiant: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  permanent?: boolean | null;
  champ_a: string | null;
  champ_e: string;
  champ_d: string | null;
  champ_q: string | null;
  priorite: string | null;
  reference_fr: string | null;
  annule: boolean;
};

type Filter = 'tous' | 'actifs' | 'aVenir' | 'expires';

function classifyNotam(n: Notam, now: number): 'actif' | 'aVenir' | 'expire' | 'annule' {
  if (n.annule) return 'annule';
  const du = new Date(n.du_at).getTime();
  if (n.permanent) return now < du ? 'aVenir' : 'actif';
  const au = new Date(n.au_at).getTime();
  if (now < du) return 'aVenir';
  if (now > au) return 'expire';
  return 'actif';
}

export default function NotamsClient({
  notams,
  canManageNotams,
}: {
  notams: Notam[];
  canManageNotams: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('actifs');
  const [showForm, setShowForm] = useState(false);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const now = Date.now();

  // Pre-classification stable pour la session
  const classified = useMemo(
    () =>
      notams.map((n) => ({ ...n, status: classifyNotam(n, now) }) as Notam & { status: ReturnType<typeof classifyNotam> }),
    [notams, now]
  );

  const counts = useMemo(() => {
    const c = { tous: 0, actifs: 0, aVenir: 0, expires: 0 };
    for (const n of classified) {
      c.tous += 1;
      if (n.status === 'actif') c.actifs += 1;
      else if (n.status === 'aVenir') c.aVenir += 1;
      else if (n.status === 'expire') c.expires += 1;
    }
    return c;
  }, [classified]);

  // Liste filtree par onglet + recherche
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return classified
      .filter((n) => {
        if (filter === 'actifs' && n.status !== 'actif') return false;
        if (filter === 'aVenir' && n.status !== 'aVenir') return false;
        if (filter === 'expires' && n.status !== 'expire') return false;
        if (q) {
          const hay = `${n.code_aeroport} ${n.identifiant} ${n.champ_e} ${n.champ_a ?? ''}`.toUpperCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const order = { actif: 0, aVenir: 1, expire: 2, annule: 3 } as const;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(b.au_at).getTime() - new Date(a.au_at).getTime();
      });
  }, [classified, filter, search]);

  // Donnees passees a la carte (NOTAMs visibles selon l'onglet)
  const mapData: NotamLite[] = useMemo(
    () =>
      filtered.map((n) => ({
        id: n.id,
        code_aeroport: n.code_aeroport,
        du_at: n.du_at,
        au_at: n.au_at,
        permanent: Boolean(n.permanent),
        annule: n.annule,
        status: n.status,
      })),
    [filtered]
  );

  const tabs: { id: Filter; label: string; count: number; icon: React.ReactNode; activeRing: string; activeBg: string }[] = [
    { id: 'tous', label: 'Tous', count: counts.tous, icon: <Layers className="h-3.5 w-3.5" />, activeRing: 'ring-sky-400/40', activeBg: 'bg-sky-500/15 text-sky-300' },
    { id: 'actifs', label: 'Actifs', count: counts.actifs, icon: <AlertTriangle className="h-3.5 w-3.5" />, activeRing: 'ring-red-400/40', activeBg: 'bg-red-500/15 text-red-300' },
    { id: 'aVenir', label: 'À venir', count: counts.aVenir, icon: <Clock className="h-3.5 w-3.5" />, activeRing: 'ring-amber-400/40', activeBg: 'bg-amber-500/15 text-amber-300' },
    { id: 'expires', label: 'Expirés', count: counts.expires, icon: <CheckCircle2 className="h-3.5 w-3.5" />, activeRing: 'ring-slate-400/40', activeBg: 'bg-slate-500/15 text-slate-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Carte interactive */}
      <NotamsMap notams={mapData} onAirportClick={setSelectedAirport} />

      {/* Bandeau onglets + recherche + creation */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => {
              const isActive = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={`group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ${
                    isActive
                      ? `${t.activeBg} ${t.activeRing} shadow-md scale-[1.03]`
                      : 'bg-slate-800/60 text-slate-400 ring-slate-700 hover:bg-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  <span
                    className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-slate-950/60' : 'bg-slate-900/80 text-slate-400'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher OACI ou texte…"
                className="input pl-8 pr-8 py-1.5 text-sm w-56"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {canManageNotams && (
              <button
                type="button"
                onClick={() => setShowForm((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-slate-700/50 text-sky-300 hover:bg-slate-600/50 transition"
              >
                <Plus className={`h-4 w-4 transition-transform ${showForm ? 'rotate-45' : ''}`} />
                {showForm ? 'Fermer' : 'Créer un NOTAM'}
              </button>
            )}
          </div>
        </div>

        {showForm && canManageNotams && (
          <div className="animate-slide-up">
            <CreateNotamForm variant="default" embedded onSuccess={() => setShowForm(false)} />
          </div>
        )}

        {/* Liste filtree */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <Layers className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              Aucun NOTAM
              {filter === 'actifs' && ' actif'}
              {filter === 'aVenir' && ' à venir'}
              {filter === 'expires' && ' expiré'}
              {search && ` correspondant à « ${search} »`}
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n, idx) => (
              <div
                key={n.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
              >
                <NotamCard
                  n={n}
                  variant="default"
                  adminDeleteButton={
                    canManageNotams ? <NotamDeleteButton notamId={n.id} variant="default" /> : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modale aeroport */}
      {selectedAirport && (
        <AirportNotamsModal
          airportCode={selectedAirport}
          notams={notams}
          canManageNotams={canManageNotams}
          filter={filter}
          onClose={() => setSelectedAirport(null)}
        />
      )}
    </div>
  );
}
