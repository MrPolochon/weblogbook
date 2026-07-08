'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Settings, Trash2, BookOpen, RotateCcw, X,
  Radio, Flame, Wrench, Shield, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import PilotesActions from './PilotesActions';
import InactivityWarningBadge from './InactivityWarningBadge';
import { formatDateTimeUTC } from '@/lib/date-utils';

type InactivityStatus = 'warned' | 'dm_failed' | null;

export type PiloteRow = {
  id: string;
  identifiant: string;
  role: string | null;
  heures_initiales_minutes: number | null;
  blocked_until: string | null;
  created_at: string;
  armee: boolean | null;
  atc: boolean | null;
  ifsa: boolean | null;
  siavi: boolean | null;
  ground_crew: boolean | null;
  last_login_at: string | null;
  last_plan_at: string | null;
  last_vol_at: string | null;
  inactif1Mois: boolean;
  warningStatus: InactivityStatus;
  warnedAt: string | null;
  deleteAfter: string | null;
  warningError: string | null;
};

type FilterTab = 'tous' | 'pilote' | 'atc' | 'ground_crew' | 'siavi' | 'admin' | 'instructeur';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  admin:       { label: 'Admin',       color: 'text-red-300',    bg: 'bg-red-500/15',    border: 'border-red-500/30',    dot: 'bg-red-400' },
  atc:         { label: 'ATC',         color: 'text-cyan-300',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/30',   dot: 'bg-cyan-400' },
  siavi:       { label: 'SIAVI',       color: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/30', dot: 'bg-purple-400' },
  ground_crew: { label: 'Ground Crew', color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/30', dot: 'bg-orange-400' },
  instructeur: { label: 'Instructeur', color: 'text-amber-300',  bg: 'bg-amber-500/15',  border: 'border-amber-500/30',  dot: 'bg-amber-400' },
  pilote:      { label: 'Pilote',      color: 'text-slate-300',  bg: 'bg-slate-700/40',  border: 'border-slate-600/40',  dot: 'bg-slate-400' },
};

const FILTER_TABS: { key: FilterTab; label: string; icon?: React.ReactNode }[] = [
  { key: 'tous',        label: 'Tous' },
  { key: 'pilote',      label: 'Pilotes' },
  { key: 'instructeur', label: 'Instructeurs' },
  { key: 'atc',         label: 'ATC',         icon: <Radio className="h-3 w-3" /> },
  { key: 'ground_crew', label: 'Ground Crew', icon: <Wrench className="h-3 w-3" /> },
  { key: 'siavi',       label: 'SIAVI',        icon: <Flame className="h-3 w-3" /> },
  { key: 'admin',       label: 'Admins',       icon: <Shield className="h-3 w-3" /> },
];

function getInitials(identifiant: string): string {
  const parts = identifiant.trim().split(/[\s_\-\.]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return identifiant.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-sky-500 to-indigo-600',
];
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function matchesFilter(p: PiloteRow, tab: FilterTab): boolean {
  const role = p.role ?? 'pilote';
  if (tab === 'tous') return true;
  if (tab === 'pilote') return role === 'pilote' || (role !== 'admin' && role !== 'atc' && role !== 'siavi' && role !== 'instructeur');
  if (tab === 'instructeur') return role === 'instructeur';
  if (tab === 'atc') return role === 'atc' || Boolean(p.atc);
  if (tab === 'siavi') return role === 'siavi' || Boolean(p.siavi);
  if (tab === 'ground_crew') return Boolean(p.ground_crew);
  if (tab === 'admin') return role === 'admin';
  return true;
}

function PiloteCard({
  p,
  onReset,
  resetting,
}: {
  p: PiloteRow;
  onReset: (id: string, identifiant: string) => void;
  resetting: boolean;
}) {
  const role = p.role ?? 'pilote';
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.pilote;
  const initials = getInitials(p.identifiant);
  const avatarGrad = getAvatarColor(p.id);
  const blocked = p.blocked_until ? new Date(p.blocked_until) > new Date() : false;
  const isAdmin = role === 'admin';

  const accessBadges = [];
  if (role === 'atc' || p.atc)         accessBadges.push({ label: 'ATC',         cls: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' });
  if (role === 'siavi' || p.siavi)     accessBadges.push({ label: 'SIAVI',       cls: 'text-purple-300 bg-purple-500/10 border-purple-500/25' });
  if (p.ground_crew)                   accessBadges.push({ label: 'Ground Crew', cls: 'text-orange-300 bg-orange-500/10 border-orange-500/25' });
  if (p.armee)                         accessBadges.push({ label: 'Armée',       cls: 'text-slate-300 bg-slate-700/30 border-slate-600/30' });
  if (p.ifsa)                          accessBadges.push({ label: 'IFSA',        cls: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' });

  return (
    <div className={`rounded-2xl border bg-slate-900/60 backdrop-blur-sm p-4 flex flex-col gap-3 transition-all hover:border-slate-600/60 hover:bg-slate-900/80 ${p.inactif1Mois && !isAdmin ? 'border-red-500/30' : 'border-slate-700/40'}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl shrink-0 bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-100 truncate">{p.identifiant}</span>
            {p.inactif1Mois && !isAdmin && (
              <InactivityWarningBadge
                userId={p.id}
                identifiant={p.identifiant}
                status={p.warningStatus}
                warnedAt={p.warnedAt}
                deleteAfter={p.deleteAfter}
                errorMsg={p.warningError}
              />
            )}
          </div>
          <span className={`inline-flex items-center gap-1 mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Access badges */}
      {accessBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {accessBadges.map((b) => (
            <span key={b.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${b.cls}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {blocked && (
          <span className="text-amber-400 font-medium">Bloqué</span>
        )}
        {p.last_login_at ? (
          <span title="Dernière connexion">{formatDateTimeUTC(p.last_login_at)}</span>
        ) : (
          <span className="italic">Jamais connecté</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700/40 flex-wrap">
        <Link
          href={`/admin/pilotes/${p.id}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-sky-400 transition-colors text-xs"
          title="Modifier"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Modifier</span>
        </Link>
        {role !== 'atc' && (
          <Link
            href={`/admin/pilotes/${p.id}/logbook`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-sky-400 transition-colors text-xs"
            title="Logbook"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Logbook</span>
          </Link>
        )}
        {!isAdmin && role !== 'pilote' && (
          <button
            onClick={() => onReset(p.id, p.identifiant)}
            disabled={resetting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-amber-400 transition-colors text-xs disabled:opacity-50"
            title="Réinitialiser au rôle pilote"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Réinitialiser</span>
          </button>
        )}
        <div className="ml-auto">
          <PilotesActions piloteId={p.id} identifiant={p.identifiant} isAdmin={isAdmin} role={role} />
        </div>
      </div>
    </div>
  );
}

export default function PilotesListClient({
  pilotes,
  admins,
  inactifsNonAvertisCount,
}: {
  pilotes: PiloteRow[];
  admins: PiloteRow[];
  inactifsNonAvertisCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('tous');
  const [resetModal, setResetModal] = useState<{ id: string; identifiant: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const allRows = useMemo(() => [...pilotes, ...admins], [pilotes, admins]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allRows) {
      const r = p.role ?? 'pilote';
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }, [allRows]);

  const totalCount = allRows.length;

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allRows.filter((p) => {
      const matchSearch = !q || p.identifiant.toLowerCase().includes(q);
      const matchTab = matchesFilter(p, activeTab);
      return matchSearch && matchTab;
    });
  }, [allRows, search, activeTab]);

  const { filteredPilotes, filteredAdmins } = useMemo(() => ({
    filteredPilotes: filteredRows.filter((p) => (p.role ?? 'pilote') !== 'admin'),
    filteredAdmins: filteredRows.filter((p) => (p.role ?? 'pilote') === 'admin'),
  }), [filteredRows]);

  async function handleConfirmReset() {
    if (!resetModal) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/pilotes/${resetModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'pilote', atc: false, siavi: false, armee: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la réinitialisation');
      toast.success(`${resetModal.identifiant} réinitialisé au rôle pilote`);
      setResetModal(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setResetting(false);
    }
  }

  const tabCountMap: Record<FilterTab, number> = {
    tous:        totalCount,
    pilote:      (roleCounts.pilote ?? 0),
    instructeur: (roleCounts.instructeur ?? 0),
    atc:         (roleCounts.atc ?? 0) + allRows.filter((p) => p.atc && p.role !== 'atc').length,
    siavi:       (roleCounts.siavi ?? 0) + allRows.filter((p) => p.siavi && p.role !== 'siavi').length,
    ground_crew: allRows.filter((p) => Boolean(p.ground_crew)).length,
    admin:       (roleCounts.admin ?? 0),
  };

  return (
    <div className="space-y-6">
      {/* Search + Filters */}
      <div className="card space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            className="input pl-9 w-full"
            placeholder="Rechercher un identifiant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => {
            const count = tabCountMap[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-800/50 border-slate-700/40 text-slate-400 hover:border-slate-600/60 hover:text-slate-300'
                }`}
              >
                {tab.icon}
                {tab.label}
                {count > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-700/60 text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats résumé */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {totalCount} comptes
          </span>
          {Object.entries(roleCounts).map(([role, count]) => {
            const cfg = ROLE_CONFIG[role];
            if (!cfg) return null;
            return (
              <span key={role} className={`flex items-center gap-1 ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label} : {count}
              </span>
            );
          })}
          {inactifsNonAvertisCount > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              ⚠️ {inactifsNonAvertisCount} inactif{inactifsNonAvertisCount > 1 ? 's' : ''} non averti{inactifsNonAvertisCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Non-admins */}
      {filteredPilotes.length > 0 && (
        <div className="space-y-3">
          {(activeTab === 'tous' || activeTab !== 'admin') && (
            <h2 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              Pilotes, instructeurs & équipes
              <span className="px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500 text-xs">{filteredPilotes.length}</span>
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPilotes.map((p) => (
              <PiloteCard
                key={p.id}
                p={p}
                onReset={(id, identifiant) => { setResetModal({ id, identifiant }); setResetError(null); }}
                resetting={resetting && resetModal?.id === p.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Admins */}
      {filteredAdmins.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 flex items-center gap-2">
            Administrateurs
            <span className="px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500 text-xs">{filteredAdmins.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAdmins.map((p) => (
              <PiloteCard
                key={p.id}
                p={p}
                onReset={(id, identifiant) => { setResetModal({ id, identifiant }); setResetError(null); }}
                resetting={resetting && resetModal?.id === p.id}
              />
            ))}
          </div>
        </div>
      )}

      {filteredRows.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-slate-400">
            {search ? `Aucun résultat pour "${search}"` : 'Aucun compte.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-cyan-400 hover:text-cyan-300 text-sm underline"
            >
              Effacer la recherche
            </button>
          )}
        </div>
      )}

      {/* Modal de confirmation de réinitialisation */}
      {resetModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !resetting && setResetModal(null)}
        >
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-400" />
                Réinitialiser l&apos;accès
              </h3>
              <button
                type="button"
                onClick={() => !resetting && setResetModal(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-amber-300 text-sm">
                Réinitialiser <strong>{resetModal.identifiant}</strong> au rôle <strong>Pilote</strong> simple ?
              </p>
              <p className="text-amber-200/70 text-xs mt-1">
                Tous les accès supplémentaires (ATC, SIAVI, Ground Crew, Armée) seront retirés.
              </p>
            </div>
            {resetError && (
              <p className="text-red-400 text-sm mb-3">{resetError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => !resetting && setResetModal(null)}
                disabled={resetting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmReset}
                disabled={resetting}
              >
                {resetting ? 'Réinitialisation…' : 'Réinitialiser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
