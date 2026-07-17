'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { InstructionProgram } from '@/lib/instruction-programs';
import { Check, ClipboardList, FileCheck2, PlaneTakeoff, Radio, BookOpen } from 'lucide-react';
import type { ExamRequestMine } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import type { StatusBadgeConfig } from '@/components/StatusBadge';

const EXAM_MINE_STATUT_MAP: Record<string, StatusBadgeConfig> = {
  assigne: { label: 'En attente de confirmation', className: 'bg-amber-500/15 text-amber-300 border border-amber-500/25' },
  accepte: { label: 'Accepté — En attente', className: 'bg-sky-500/15 text-sky-300 border border-sky-500/25' },
  en_cours: { label: 'Session en cours', className: 'bg-violet-500/15 text-violet-300 border border-violet-500/25' },
  termine_reussi: { label: 'Réussi ✓', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' },
  termine_echoue: { label: 'Échoué', className: 'bg-red-500/15 text-red-300 border border-red-500/25' },
  termine_unknown: { label: 'Terminé', className: 'bg-slate-700/60 text-slate-400' },
  refuse: { label: 'Refusé', className: 'bg-red-500/15 text-red-300 border border-red-500/25' },
};

interface MonEspaceTabProps {
  examLicenceOptions: string[];
  myFormationActive: boolean;
  myFormationLicence: string | null;
  myProgram: InstructionProgram | null;
  myInstructorIdentifiant: string | null;
  myProgressPercent: number;
  myCompletedSet: Set<string>;
  examRequestsMine: ExamRequestMine[];
  pilotTrainingsMine: Array<Record<string, string | null | undefined>>;
  isPilotTrainingInstructor: boolean;
  pilotTrainingsAssigned: Array<Record<string, string | null | undefined>>;
  atcTrainingsMine: Array<Record<string, string | null | undefined>>;
  isAtcTrainingInstructor: boolean;
  atcTrainingsAssigned: Array<Record<string, string | null | undefined>>;
}

export default function MonEspaceTab({
  examLicenceOptions,
  myFormationActive,
  myFormationLicence,
  myProgram,
  myInstructorIdentifiant,
  myProgressPercent,
  myCompletedSet,
  examRequestsMine,
  pilotTrainingsMine,
  isPilotTrainingInstructor,
  pilotTrainingsAssigned,
  atcTrainingsMine,
  isAtcTrainingInstructor,
  atcTrainingsAssigned,
}: MonEspaceTabProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [examLicence, setExamLicence] = useState(myFormationLicence || examLicenceOptions[0] || 'CAL-ATC');
  const [examMessage, setExamMessage] = useState('');
  const [pilotTrainingMessage, setPilotTrainingMessage] = useState('');
  const [atcTrainingMessage, setAtcTrainingMessage] = useState('');

  async function run(action: () => Promise<void>) {
    setLoading(true);
    try {
      await action();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function createExamRequest(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/exam-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licence_code: examLicence, message: examMessage.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur demande examen');
      setExamMessage('');
      toast.success('Action effectuee.');
    });
  }

  async function cancelMyExamRequest(id: string) {
    if (!confirm('Annuler cette demande d\'examen ?')) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur annulation');
      toast.success('Demande d\'examen annulée.');
    });
  }

  async function requestPilotTraining(ev: React.FormEvent) {
    ev.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/pilot-trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pilotTrainingMessage.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur demande training');
      setPilotTrainingMessage('');
      toast.success('Demande envoyée. Un FI est assigné en priorité (FE si les FI sont très chargés) — convenez de la date en message privé.');
    });
  }

  async function annulePilotTraining(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/pilot-trainings/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur annulation');
      toast.success('Demande annulée.');
    });
  }

  async function terminePilotTraining(id: string) {
    if (!confirm('Marquer la session de training comme terminée ? Cette fiche sera effacée.')) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/pilot-trainings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'termine' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Session clôturée.');
    });
  }

  async function requestAtcTraining(ev: React.FormEvent) {
    ev.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/atc-trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: atcTrainingMessage.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur demande training');
      setAtcTrainingMessage('');
      toast.success('Demande envoyée. Un ATC FI est assigné en priorité (ATC FE si les ATC FI sont très chargés) — convenez de la date en message privé.');
    });
  }

  async function annuleAtcTraining(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/atc-trainings/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur annulation');
      toast.success('Demande annulée.');
    });
  }

  async function termineAtcTraining(id: string) {
    if (!confirm('Marquer la session de training comme terminée ? Cette fiche sera effacée.')) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/atc-trainings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'termine' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Session clôturée.');
    });
  }

  return (
    <>
      <form onSubmit={createExamRequest} className="card space-y-4 border-l-4 border-l-amber-500/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10"><ClipboardList className="h-5 w-5 text-amber-400" /></div>
          <h2 className="text-lg font-semibold text-slate-100">Demander un examen</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="input" value={examLicence} onChange={(e) => setExamLicence(e.target.value)} required>
            {examLicenceOptions.map((licence) => (
              <option key={licence} value={licence}>{licence}</option>
            ))}
          </select>
          <input
            className="input md:col-span-2"
            value={examMessage}
            onChange={(e) => setExamMessage(e.target.value)}
            placeholder="Message (optionnel)"
          />
        </div>
        <button className="btn-primary" type="submit" disabled={loading}>Envoyer la demande</button>
      </form>

      {myFormationActive && myProgram && (
        <div className="card space-y-4 border-l-4 border-l-emerald-500/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><BookOpen className="h-5 w-5 text-emerald-400" /></div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-100">Ma progression — {myProgram.label}</h2>
              <p className="text-sm text-slate-400">Instructeur référent : <span className="text-slate-200">{myInstructorIdentifiant || '—'}</span></p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-400">{myProgressPercent}%</p>
              <p className="text-xs text-slate-500">{myCompletedSet.size}/{myProgram.modules.length} modules</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700" style={{ width: `${myProgressPercent}%` }} />
          </div>
          <div className="space-y-2">
            {myProgram.modules.map((m, i) => (
              <div key={m.code} className="flex items-center gap-3 p-3 rounded-xl border border-slate-700/40 bg-slate-800/20 transition-colors hover:bg-slate-800/40">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${myCompletedSet.has(m.code) ? 'bg-emerald-500/20' : 'bg-slate-700/40'}`}>
                  {myCompletedSet.has(m.code)
                    ? <Check className="h-4 w-4 text-emerald-400" />
                    : <span className="text-xs font-mono text-slate-500">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${myCompletedSet.has(m.code) ? 'text-emerald-200' : 'text-slate-200'}`}>{m.code} — {m.title}</p>
                  <p className="text-xs text-slate-500 truncate">{m.description}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${myCompletedSet.has(m.code) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}>
                  {myCompletedSet.has(m.code) ? 'Validé' : 'À faire'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-4 border-l-4 border-l-sky-500/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10"><FileCheck2 className="h-5 w-5 text-sky-400" /></div>
          <h2 className="text-lg font-semibold text-slate-100">Mes demandes d&apos;examen</h2>
          {examRequestsMine.length > 0 && (
            <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 font-medium">{examRequestsMine.length}</span>
          )}
        </div>
        {examRequestsMine.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardList className="h-8 w-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Aucune demande d&apos;examen.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {examRequestsMine.map((r) => {
              const instructeur = Array.isArray(r.instructeur) ? r.instructeur[0] : r.instructeur;
              const effectiveStatut = r.statut === 'termine'
                ? `termine_${r.resultat || 'unknown'}`
                : r.statut;
              return (
                <div key={r.id} className="rounded-xl border border-slate-700/50 bg-slate-800/20 hover:border-slate-700/70 transition-colors p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-slate-100 font-semibold">{r.licence_code}</p>
                    <StatusBadge status={effectiveStatut} map={EXAM_MINE_STATUT_MAP} />
                  </div>
                  <p className="text-xs text-slate-500">Examinateur : <span className="text-slate-400">{instructeur?.identifiant || 'Assignation en cours…'}</span></p>
                  {r.statut === 'en_cours' && (
                    <p className="text-sm text-violet-300 bg-violet-500/5 border border-violet-500/15 rounded-lg px-3 py-2">
                      Votre session d&apos;examen est en cours. Effectuez votre vol normalement.
                    </p>
                  )}
                  {r.message && <p className="text-xs text-slate-400 border-l-2 border-slate-700 pl-2">Demande : {r.message}</p>}
                  {r.response_note && <p className="text-xs text-sky-300 border-l-2 border-sky-500/40 pl-2">Réponse : {r.response_note}</p>}
                  {(r.statut === 'assigne' || r.statut === 'accepte') && (
                    <button type="button" onClick={() => cancelMyExamRequest(r.id)} disabled={loading}
                      className="mt-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                      Annuler la demande
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card space-y-4 border-l-4 border-l-teal-500/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10"><PlaneTakeoff className="h-5 w-5 text-teal-400" /></div>
          <h2 className="text-lg font-semibold text-slate-100">Session de training (vol / pilote)</h2>
        </div>
        <p className="text-sm text-slate-500">
          <strong className="text-slate-400">Tout le monde</strong> peut demander un accompagnement vol. Un{' '}
          <strong className="text-slate-400">FI</strong> est assigné en priorité (répartition de charge) ; un{' '}
          <strong className="text-slate-400">FE</strong> n&apos;intervient que si les FI sont déjà très chargés.
          Convenez d&apos;une date <strong>en message privé</strong>. L&apos;instructeur clôt la fiche ici à la fin
          (elle disparaît).
        </p>
        <form onSubmit={requestPilotTraining} className="space-y-2">
          <input
            className="input w-full"
            value={pilotTrainingMessage}
            onChange={(e) => setPilotTrainingMessage(e.target.value)}
            placeholder="Message (optionnel) pour l'instructeur"
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            Demander une session de training
          </button>
        </form>
        {pilotTrainingsMine.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-400 mb-2">Mes demandes en cours (vol)</p>
            <ul className="space-y-2">
              {pilotTrainingsMine.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/50 bg-slate-800/20 px-4 py-3 text-sm">
                  <span className="text-slate-300">
                    Assigné à <span className="text-slate-100 font-medium">{t.assignee_identifiant || '—'}</span>
                    {t.message ? <span className="block text-xs text-slate-500 mt-1">{t.message}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg px-3 py-1.5 transition-colors"
                    onClick={() => annulePilotTraining(String(t.id))}
                    disabled={loading}
                  >
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isPilotTrainingInstructor && pilotTrainingsAssigned.length > 0 && (
          <div>
            <p className="text-sm font-medium text-emerald-300/80 mb-2">Training vol à assurer (côté instructeur)</p>
            <ul className="space-y-2">
              {pilotTrainingsAssigned.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm">
                  <span className="text-slate-300">
                    Avec <span className="text-slate-100 font-medium">{t.requester_identifiant || '—'}</span>
                    {t.message ? <span className="block text-xs text-slate-500 mt-1">{t.message}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="btn-primary text-xs py-1"
                    onClick={() => terminePilotTraining(String(t.id))}
                    disabled={loading}
                  >
                    Session terminée
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card space-y-4 border-l-4 border-l-indigo-500/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10"><Radio className="h-5 w-5 text-indigo-400" /></div>
          <h2 className="text-lg font-semibold text-slate-100">Session de training (ATC)</h2>
        </div>
        <p className="text-sm text-slate-500">
          Tout le monde peut demander un accompagnement. Un <strong className="text-slate-400">ATC FI</strong> est assigné
          en priorité (répartition de charge) ; un <strong className="text-slate-400">ATC FE</strong> n&apos;intervient
          que si les ATC FI sont déjà très chargés. Convenez d&apos;une date <strong>en message privé</strong>.
          L&apos;instructeur clôt la fiche ici quand c&apos;est fini (elle disparaît).
        </p>
        <form onSubmit={requestAtcTraining} className="space-y-2">
          <input
            className="input w-full"
            value={atcTrainingMessage}
            onChange={(e) => setAtcTrainingMessage(e.target.value)}
            placeholder="Message (optionnel) pour l'instructeur"
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            Demander une session de training
          </button>
        </form>
        {atcTrainingsMine.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-400 mb-2">Mes demandes en cours</p>
            <ul className="space-y-2">
              {atcTrainingsMine.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/50 bg-slate-800/20 px-4 py-3 text-sm">
                  <span className="text-slate-300">
                    Assigné à <span className="text-slate-100 font-medium">{t.assignee_identifiant || '—'}</span>
                    {t.message ? <span className="block text-xs text-slate-500 mt-1">{t.message}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg px-3 py-1.5 transition-colors"
                    onClick={() => annuleAtcTraining(String(t.id))}
                    disabled={loading}
                  >
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isAtcTrainingInstructor && atcTrainingsAssigned.length > 0 && (
          <div>
            <p className="text-sm font-medium text-amber-300/80 mb-2">Training à assurer (côté instructeur)</p>
            <ul className="space-y-2">
              {atcTrainingsAssigned.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
                  <span className="text-slate-300">
                    Avec <span className="text-slate-100 font-medium">{t.requester_identifiant || '—'}</span>
                    {t.message ? <span className="block text-xs text-slate-500 mt-1">{t.message}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="btn-primary text-xs py-1"
                    onClick={() => termineAtcTraining(String(t.id))}
                    disabled={loading}
                  >
                    Session terminée
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
