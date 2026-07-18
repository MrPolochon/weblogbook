'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Shield, LayoutDashboard, Target, BookOpen, Plus, FileText,
} from 'lucide-react';
import Link from 'next/link';
import type { MilitaireStats, MilitaireTabId, VolMilitaireRow } from './types';
import { ARME_MISSIONS } from '@/lib/armee';
import VueEnsembleTab from './components/VueEnsembleTab';
import MissionsTab from './components/MissionsTab';
import CarnetTab from './components/CarnetTab';

type Props = {
  vols: VolMilitaireRow[];
  stats: MilitaireStats;
  userId: string;
  identifiant: string;
  isPdgMilitaire: boolean;
  isBlocked: boolean;
  blockedUntil?: string | null;
};

const TABS: { id: MilitaireTabId; label: string; icon: typeof Shield }[] = [
  { id: 'vue', label: 'Vue d\'ensemble', icon: LayoutDashboard },
  { id: 'missions', label: 'Missions', icon: Target },
  { id: 'carnet', label: 'Carnet de vol', icon: BookOpen },
];

export default function MilitaireClient({
  vols,
  stats,
  userId,
  identifiant,
  isPdgMilitaire,
  isBlocked,
  blockedUntil,
}: Props) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as MilitaireTabId | null;
  const [activeTab, setActiveTab] = useState<MilitaireTabId>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'vue',
  );

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="space-y-6 animate-page-reveal max-w-5xl mx-auto w-full">
      {/* Header HUD militaire */}
      <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-50" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-red-500/8 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-amber-500/8 blur-3xl" />
        <Shield
          className="pointer-events-none absolute top-4 right-6 h-24 w-24 text-red-500/5"
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-amber-500/10 border border-red-500/20">
                <Shield className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Espace Militaire</h1>
                <p className="text-sm text-slate-400 mt-0.5">Missions, carnet de vol et opérations armée</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isBlocked && (
                <Link href="/militaire/nouveau" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-sm font-medium transition-colors">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nouveau vol</span>
                </Link>
              )}
              <Link
                href="/logbook/depot-plan-vol"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-500/40 text-sky-200 hover:bg-sky-500/10 text-sm font-medium transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Plan ATC</span>
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {stats.volsEnAttente > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                {stats.volsEnAttente} vol{stats.volsEnAttente > 1 ? 's' : ''} en attente
              </span>
            )}
            {stats.flotteActive > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-medium">
                {stats.flotteActive} appareil{stats.flotteActive > 1 ? 's' : ''} en service
              </span>
            )}
            {isPdgMilitaire && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium"
                title="Commandant opérationnel : briefing, validation des vols militaires, compte Felitz Armée"
              >
                PDG Armée
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-800/60">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badge = tab.id === 'carnet' ? vols.length : tab.id === 'missions' ? ARME_MISSIONS.length : 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-slate-700/80 text-slate-50 shadow-lg shadow-slate-900/50 border border-slate-600/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-red-400' : ''}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              {badge > 0 && tab.id === 'carnet' && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'vue' && (
        <VueEnsembleTab
          stats={stats}
          identifiant={identifiant}
          isPdgMilitaire={isPdgMilitaire}
          isBlocked={isBlocked}
          blockedUntil={blockedUntil}
        />
      )}
      {activeTab === 'missions' && <MissionsTab />}
      {activeTab === 'carnet' && <CarnetTab vols={vols} userId={userId} />}
    </div>
  );
}
