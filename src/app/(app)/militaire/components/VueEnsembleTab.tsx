'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Plane, FileText, Landmark, Clock, Target, Shield,
  AlertCircle, CheckCircle2, XCircle, ChevronRight, Trophy, Flame, Megaphone, Loader2,
} from 'lucide-react';
import { formatDuree } from '@/lib/utils';
import { PDG_MILITAIRE_ROLE, type HonorBoard, type PilotMilitaryStats } from '@/lib/armee';
import type { MilitaireStats } from '../types';

type Props = {
  stats: MilitaireStats;
  identifiant: string;
  isPdgMilitaire: boolean;
  isBlocked: boolean;
  blockedUntil?: string | null;
};

type BriefingState = {
  titre: string;
  contenu: string;
  actif: boolean;
} | null;

export default function VueEnsembleTab({
  stats,
  identifiant,
  isPdgMilitaire,
  isBlocked,
  blockedUntil,
}: Props) {
  const [pilot, setPilot] = useState<PilotMilitaryStats | null>(null);
  const [honor, setHonor] = useState<HonorBoard | null>(null);
  const [briefing, setBriefing] = useState<BriefingState>(null);
  const [canEditBriefing, setCanEditBriefing] = useState(false);
  const [briefDraft, setBriefDraft] = useState({ titre: '', contenu: '', actif: false });
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefMsg, setBriefMsg] = useState<string | null>(null);
  const [loadingOps, setLoadingOps] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, briefRes] = await Promise.all([
          fetch('/api/armee/stats?period=week'),
          fetch('/api/armee/briefing'),
        ]);
        if (statsRes.ok) {
          const data = await statsRes.json();
          if (!cancelled) {
            setPilot(data.pilot ?? null);
            setHonor(data.honor ?? null);
          }
        }
        if (briefRes.ok) {
          const data = await briefRes.json();
          if (!cancelled) {
            setCanEditBriefing(Boolean(data.canEdit));
            const b = data.briefing;
            if (b) {
              setBriefing(b);
              setBriefDraft({
                titre: b.titre || '',
                contenu: b.contenu || '',
                actif: Boolean(b.actif),
              });
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingOps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveBriefing() {
    setSavingBrief(true);
    setBriefMsg(null);
    try {
      const res = await fetch('/api/armee/briefing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBriefing(briefDraft.actif && briefDraft.contenu.trim() ? briefDraft : null);
      setBriefMsg('Briefing enregistré');
    } catch (e) {
      setBriefMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingBrief(false);
    }
  }

  return (
    <div className="space-y-6">
      {isBlocked && blockedUntil && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Compte temporairement bloqué</p>
            <p className="text-xs text-red-200/70 mt-0.5">
              Vous ne pouvez pas déposer de vol jusqu&apos;au {new Date(blockedUntil).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC.
            </p>
          </div>
        </div>
      )}

      {/* Briefing opérationnel */}
      {(briefing?.actif && briefing.contenu.trim()) || canEditBriefing ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-200">
              {briefing?.titre || 'Briefing opérationnel'}
            </h3>
          </div>
          {briefing?.actif && briefing.contenu.trim() && !canEditBriefing && (
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{briefing.contenu}</p>
          )}
          {canEditBriefing && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                En tant que {PDG_MILITAIRE_ROLE.shortLabel}, vous publiez le briefing visible par tous les pilotes militaires.
              </p>
              <input
                className="input w-full"
                value={briefDraft.titre}
                onChange={(e) => setBriefDraft((d) => ({ ...d, titre: e.target.value }))}
                placeholder="Titre du briefing"
              />
              <textarea
                className="input w-full min-h-[100px]"
                value={briefDraft.contenu}
                onChange={(e) => setBriefDraft((d) => ({ ...d, contenu: e.target.value }))}
                placeholder="Ordres du jour, zones sensibles, consignes…"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={briefDraft.actif}
                  onChange={(e) => setBriefDraft((d) => ({ ...d, actif: e.target.checked }))}
                />
                Afficher aux pilotes
              </label>
              <button
                type="button"
                onClick={saveBriefing}
                disabled={savingBrief}
                className="px-4 py-2 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {savingBrief ? 'Enregistrement…' : 'Enregistrer le briefing'}
              </button>
              {briefMsg && <p className="text-xs text-slate-400">{briefMsg}</p>}
            </div>
          )}
        </div>
      ) : null}

      {/* Grade + streak */}
      {loadingOps ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des stats opérationnelles…
        </div>
      ) : pilot ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-xl border bg-gradient-to-br p-4 ${pilot.grade.bg}`}>
            <p className="text-xs text-slate-400 mb-1">Grade</p>
            <p className={`text-xl font-bold ${pilot.grade.color}`}>{pilot.grade.label}</p>
            {pilot.nextGrade && (
              <p className="text-xs text-slate-500 mt-1">
                {pilot.missionsToNextGrade} mission{pilot.missionsToNextGrade > 1 ? 's' : ''} → {pilot.nextGrade.label}
              </p>
            )}
          </div>
          <StatCard
            icon={Target}
            label="Missions validées"
            value={String(pilot.missionsCompleted)}
            accent="sky"
          />
          <StatCard
            icon={Flame}
            label="Série ops (jours)"
            value={String(pilot.opsStreak)}
            accent="amber"
          />
          <StatCard
            icon={Trophy}
            label="Taux de succès"
            value={pilot.successRate != null ? `${pilot.successRate}%` : '—'}
            accent="emerald"
          />
        </div>
      ) : null}

      {/* Stats carnet */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Temps validé" value={formatDuree(stats.totalMinutesValides)} accent="emerald" />
        <StatCard icon={CheckCircle2} label="Vols validés" value={String(stats.volsValides)} accent="sky" />
        <StatCard icon={AlertCircle} label="En attente" value={String(stats.volsEnAttente)} accent="amber" />
        <StatCard icon={Shield} label="Flotte active" value={String(stats.flotteActive)} accent="red" />
      </div>

      {/* Tableau d'honneur */}
      {honor && honor.entries.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Tableau d&apos;honneur — {honor.period === 'week' ? '7 derniers jours' : '30 derniers jours'}
            </h3>
          </div>
          <ol className="space-y-2">
            {honor.entries.slice(0, 5).map((e, i) => (
              <li key={e.userId} className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-300">
                  <span className="text-slate-500 font-mono mr-2">#{i + 1}</span>
                  {e.identifiant}
                </span>
                <span className="text-xs text-slate-500">
                  {e.missionsCount} mission{e.missionsCount > 1 ? 's' : ''} · {e.totalReward.toLocaleString('fr-FR')} F$
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Rôle PDG */}
      {isPdgMilitaire && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-200">{PDG_MILITAIRE_ROLE.label}</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{PDG_MILITAIRE_ROLE.description}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-emerald-400/90 mb-1.5">Vous pouvez</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                {PDG_MILITAIRE_ROLE.powers.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Hors périmètre</p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                {PDG_MILITAIRE_ROLE.notPowers.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Actions rapides</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionLink
            href="/militaire/nouveau"
            icon={Plus}
            title="Nouveau vol (carnet)"
            description="Soumettre un vol pour validation"
            accent="red"
            disabled={isBlocked}
          />
          <ActionLink
            href="/logbook/depot-plan-vol"
            icon={FileText}
            title="Déposer un plan ATC"
            description="Plan de vol classique, flotte armée"
            accent="sky"
          />
          <ActionLink
            href="/militaire?tab=missions"
            icon={Target}
            title="Voir les missions"
            description="Missions rémunérées, grades et cooldown"
            accent="amber"
          />
          {isPdgMilitaire && (
            <ActionLink
              href="/felitz-bank"
              icon={Landmark}
              title="Compte Felitz Armée"
              description="Gestion financière militaire"
              accent="emerald"
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-slate-200">Carnet vs Plan de vol</h3>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Le <strong className="text-slate-300">carnet militaire</strong> enregistre vos vols pour validation (admin ou PDG) et déclenche les récompenses de mission.
            Le <strong className="text-slate-300">plan de vol ATC</strong> suit le circuit classique du logbook.
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-slate-200">Profil militaire</h3>
          </div>
          <p className="text-sm text-slate-400">
            Connecté en tant que <span className="text-slate-200 font-medium">{identifiant}</span>
            {isPdgMilitaire && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-red-500/15 text-red-300 border border-red-500/25">
                {PDG_MILITAIRE_ROLE.shortLabel}
              </span>
            )}
            {pilot && (
              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${pilot.grade.bg} ${pilot.grade.color}`}>
                {pilot.grade.label}
              </span>
            )}
          </p>
          {pilot && pilot.totalFelitzEarned > 0 && (
            <p className="text-xs text-emerald-400/80">
              {pilot.totalFelitzEarned.toLocaleString('fr-FR')} F$ gagnés en missions (compte Armée)
            </p>
          )}
          {stats.volsRefuses > 0 && (
            <p className="text-xs text-red-400/80 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              {stats.volsRefuses} vol{stats.volsRefuses > 1 ? 's' : ''} refusé{stats.volsRefuses > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: 'emerald' | 'sky' | 'amber' | 'red';
}) {
  const styles = {
    emerald: { box: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20', icon: 'text-emerald-400' },
    sky: { box: 'from-sky-500/10 to-sky-500/5 border-sky-500/20', icon: 'text-sky-400' },
    amber: { box: 'from-amber-500/10 to-amber-500/5 border-amber-500/20', icon: 'text-amber-400' },
    red: { box: 'from-red-500/10 to-red-500/5 border-red-500/20', icon: 'text-red-400' },
  }[accent];

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${styles.box}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${styles.icon}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

function ActionLink({
  href,
  icon: Icon,
  title,
  description,
  accent,
  disabled,
}: {
  href: string;
  icon: typeof Plus;
  title: string;
  description: string;
  accent: 'red' | 'sky' | 'amber' | 'emerald';
  disabled?: boolean;
}) {
  const iconColors = {
    red: 'text-red-400 bg-red-500/10',
    sky: 'text-sky-400 bg-sky-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
  }[accent];

  if (disabled) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-700/30 bg-slate-800/20 opacity-50 cursor-not-allowed">
        <div className={`p-2 rounded-lg ${iconColors}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-300">{title}</p>
          <p className="text-xs text-slate-500 truncate">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-200"
    >
      <div className={`p-2 rounded-lg ${iconColors}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{title}</p>
        <p className="text-xs text-slate-500 truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
    </Link>
  );
}
