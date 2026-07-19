'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { InstructionProgram } from '@/lib/instruction-programs';
import {
  GraduationCap, BookOpen, Users, Award, Plane,
  ClipboardList, FileCheck2, Shield,
} from 'lucide-react';
import type { ExamRequestMine, ExamRequestAssigned, Eleve, TypeAvion, AvionTemp, AdminOpenDemande } from './types';
import MonEspaceTab from './components/MonEspaceTab';
import FormationTab from './components/FormationTab';
import ExamensTab from './components/ExamensTab';
import AdminDemandesTab from './components/AdminDemandesTab';
import AdminReferentsTab from './components/AdminReferentsTab';

type TabId = 'espace' | 'formation' | 'examens' | 'admin';

export default function InstructionClient({
  loadError,
  viewerRole,
  viewerId: _viewerId,
  isManager: isManagerProp,
  canGrantTitreInstructionFlight,
  canGrantTitreInstructionAtc,
  titresCiblesPilotes,
  canViewExaminerInbox,
  isAtcTrainingInstructor,
  isPilotTrainingInstructor,
  programs,
  createFormationPrograms,
  examLicenceOptions,
  pilotTrainingLicenceOptions,
  atcTrainingLicenceOptions,
  pilotTrainingsMine,
  pilotTrainingsAssigned,
  atcTrainingsMine,
  atcTrainingsAssigned,
  myFormationActive,
  myFormationLicence,
  myInstructorIdentifiant,
  myProgression,
  examRequestsMine,
  examRequestsAssigned,
  adminOpenDemandes = [],
  eleves,
  typesAvion,
  avionsTemp,
  elevesProgression,
  initialIndisponible,
}: {
  loadError?: string;
  viewerRole: string;
  viewerId: string;
  isManager: boolean;
  canGrantTitreInstructionFlight: boolean;
  canGrantTitreInstructionAtc: boolean;
  titresCiblesPilotes: Array<{ id: string; identifiant: string }>;
  canViewExaminerInbox: boolean;
  isAtcTrainingInstructor: boolean;
  isPilotTrainingInstructor: boolean;
  programs: InstructionProgram[];
  createFormationPrograms: InstructionProgram[];
  examLicenceOptions: string[];
  pilotTrainingLicenceOptions: string[];
  atcTrainingLicenceOptions: string[];
  pilotTrainingsMine: Array<Record<string, string | null | undefined>>;
  pilotTrainingsAssigned: Array<Record<string, string | null | undefined>>;
  atcTrainingsMine: Array<Record<string, string | null | undefined>>;
  atcTrainingsAssigned: Array<Record<string, string | null | undefined>>;
  myFormationActive: boolean;
  myFormationLicence: string | null;
  myInstructorIdentifiant: string | null;
  myProgression: Array<{ licence_code: string; module_code: string; completed: boolean; note?: string | null }>;
  examRequestsMine: ExamRequestMine[];
  examRequestsAssigned: ExamRequestAssigned[];
  adminOpenDemandes?: AdminOpenDemande[];
  eleves: Eleve[];
  typesAvion: TypeAvion[];
  avionsTemp: AvionTemp[];
  elevesProgression: Array<{ eleve_id: string; licence_code: string; module_code: string; completed: boolean; note?: string | null }>;
  initialIndisponible?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isManager = isManagerProp;
  const formationProgramsForCreate = createFormationPrograms.length > 0 ? createFormationPrograms : programs;
  const isInstructeurOuExaminateur = isManager || canViewExaminerInbox;

  const [indisponible, setIndisponible] = useState(initialIndisponible ?? false);
  const [togglingDispo, setTogglingDispo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('espace');

  const instructionTitreOptions = useMemo(() => {
    const out: string[] = [];
    if (canGrantTitreInstructionFlight) { out.push('FI', 'FE'); }
    if (canGrantTitreInstructionAtc) { out.push('ATC FI', 'ATC FE'); }
    return out;
  }, [canGrantTitreInstructionFlight, canGrantTitreInstructionAtc]);

  const isStaffAdmin = viewerRole === 'admin';
  const showExamensTab =
    canViewExaminerInbox || instructionTitreOptions.length > 0 || isStaffAdmin;

  const myProgram = useMemo(
    () => programs.find((p) => p.licenceCode === myFormationLicence) || null,
    [programs, myFormationLicence],
  );
  const myCompletedSet = useMemo(
    () => new Set(myProgression.filter((p) => p.completed).map((p) => p.module_code)),
    [myProgression],
  );
  const myProgressPercent = useMemo(() => {
    if (!myProgram || myProgram.modules.length === 0) return 0;
    return Math.round((myCompletedSet.size / myProgram.modules.length) * 100);
  }, [myProgram, myCompletedSet]);

  const pendingExamsCount = useMemo(
    () => examRequestsMine.filter((r) => r.statut !== 'termine' && r.statut !== 'refuse').length,
    [examRequestsMine],
  );
  const assignedExamsCount = useMemo(
    () => examRequestsAssigned.filter((r) => r.statut !== 'termine').length,
    [examRequestsAssigned],
  );

  async function toggleDisponibilite() {
    setTogglingDispo(true);
    try {
      const res = await fetch('/api/instruction/disponibilite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indisponible: !indisponible }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; transferts?: number; elevesNonTransferes?: string[] };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setIndisponible(!indisponible);
      if (!indisponible && (data.transferts ?? 0) > 0) {
        toast.success(`Mode indisponible activé. ${data.transferts} élève(s) transféré(s).`);
      } else if (!indisponible && (data.elevesNonTransferes ?? []).length > 0) {
        toast.warning(`Mode indisponible activé. Aucun instructeur disponible pour : ${data.elevesNonTransferes!.join(', ')}.`);
      } else {
        toast.success(!indisponible ? 'Vous êtes maintenant indisponible.' : 'Vous êtes de nouveau disponible.');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setTogglingDispo(false);
    }
  }

  return (
    <div
      className={`space-y-6 animate-page-reveal mx-auto w-full ${
        activeTab === 'admin' ? 'max-w-7xl' : 'max-w-5xl'
      }`}
    >
      {loadError && (
        <div className="sticky top-0 z-10 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}

      {/* ===== HUD Header aviation ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 h-40 w-40 sm:h-56 sm:w-56 opacity-20">
          <div className="absolute inset-0 rounded-full border border-sky-500/20" />
          <div className="absolute inset-[25%] rounded-full border border-sky-500/15" />
          <div className="absolute inset-[50%] rounded-full border border-sky-500/10" />
          <div className="absolute inset-0 origin-center animate-compass-spin">
            <div className="absolute left-1/2 top-0 h-1/2 w-px bg-gradient-to-b from-sky-400/60 to-transparent" />
          </div>
        </div>
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-sky-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/20">
              <GraduationCap className="h-7 w-7 text-sky-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Centre d&apos;Instruction</h1>
              <p className="text-sm text-slate-400 mt-0.5">Suivi de formation, examens et gestion pédagogique</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {myFormationActive && myProgram && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium">{myProgram.label} — {myProgressPercent}%</span>
              </div>
            )}
            {pendingExamsCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ClipboardList className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300 font-medium">{pendingExamsCount} examen{pendingExamsCount > 1 ? 's' : ''} en cours</span>
              </div>
            )}
            {isManager && eleves.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <Users className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-sky-300 font-medium">{eleves.length} élève{eleves.length > 1 ? 's' : ''} actif{eleves.length > 1 ? 's' : ''}</span>
              </div>
            )}
            {assignedExamsCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <FileCheck2 className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-violet-300 font-medium">{assignedExamsCount} examen{assignedExamsCount > 1 ? 's' : ''} à traiter</span>
              </div>
            )}
            {isInstructeurOuExaminateur && indisponible && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-orange-300 font-medium text-xs">Indisponible</span>
              </div>
            )}
          </div>

          {isInstructeurOuExaminateur && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleDisponibilite}
                disabled={togglingDispo}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  indisponible
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20'
                } disabled:opacity-50`}
              >
                <span className={`h-2 w-2 rounded-full ${indisponible ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400'}`} />
                {togglingDispo ? 'Mise à jour...' : indisponible ? 'Me rendre disponible' : 'Me mettre indisponible'}
              </button>
              {!indisponible && (
                <p className="text-xs text-slate-500 max-w-xs">
                  En mode indisponible, vous ne recevrez plus de nouvelles demandes. Vos élèves actifs seront transférés automatiquement.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Tab Bar ===== */}
      <div className="flex gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-800/60">
        {([
          { id: 'espace' as TabId, label: 'Mon Espace', icon: BookOpen, visible: true },
          { id: 'formation' as TabId, label: 'Formation', icon: Users, visible: isManager },
          { id: 'examens' as TabId, label: 'Examens & Titres', icon: Award, visible: showExamensTab },
          { id: 'admin' as TabId, label: 'Admin', icon: Shield, visible: isStaffAdmin },
        ]).filter((t) => t.visible).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-slate-700/80 text-slate-50 shadow-lg shadow-slate-900/50 border border-slate-600/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-sky-400' : ''}`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===== Tab Content ===== */}
      {activeTab === 'espace' && (
        <MonEspaceTab
          examLicenceOptions={examLicenceOptions}
          pilotTrainingLicenceOptions={pilotTrainingLicenceOptions}
          atcTrainingLicenceOptions={atcTrainingLicenceOptions}
          myFormationActive={myFormationActive}
          myFormationLicence={myFormationLicence}
          myProgram={myProgram}
          myInstructorIdentifiant={myInstructorIdentifiant}
          myProgressPercent={myProgressPercent}
          myCompletedSet={myCompletedSet}
          examRequestsMine={examRequestsMine}
          pilotTrainingsMine={pilotTrainingsMine}
          isPilotTrainingInstructor={isPilotTrainingInstructor}
          pilotTrainingsAssigned={pilotTrainingsAssigned}
          atcTrainingsMine={atcTrainingsMine}
          isAtcTrainingInstructor={isAtcTrainingInstructor}
          atcTrainingsAssigned={atcTrainingsAssigned}
          typesAvion={typesAvion}
          avionsTemp={avionsTemp}
        />
      )}

      {activeTab === 'formation' && isManager && (
        <FormationTab
          formationProgramsForCreate={formationProgramsForCreate}
          programs={programs}
          isManager={isManager}
          eleves={eleves}
          elevesProgression={elevesProgression}
        />
      )}

      {activeTab === 'examens' && (
        <ExamensTab
          instructionTitreOptions={instructionTitreOptions}
          titresCiblesPilotes={titresCiblesPilotes}
          viewerRole={viewerRole}
          canViewExaminerInbox={canViewExaminerInbox}
          examRequestsAssigned={examRequestsAssigned}
          typesAvion={typesAvion}
          avionsTemp={avionsTemp}
        />
      )}

      {activeTab === 'admin' && isStaffAdmin && (
        <div className="space-y-6 min-w-0 w-full max-w-none">
          <AdminDemandesTab adminOpenDemandes={adminOpenDemandes} />
          <AdminReferentsTab />
        </div>
      )}
    </div>
  );
}
