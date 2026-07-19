'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Shield, UserRound, XCircle } from 'lucide-react';
import type { AdminExamTrainerConflicts, AdminOpenDemande, AdminStaffReassignPools } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import type { StatusBadgeConfig } from '@/components/StatusBadge';
import { assigneeLicenceHint } from '@/lib/instruction-exam-rules';
import {
  buildAdminReassignCandidates,
  EMPTY_POOLS,
} from '@/lib/instruction-admin-staff-pools';
import DemandeRaisonButton from './DemandeRaisonButton';

const EXAM_STATUT_MAP: Record<string, StatusBadgeConfig> = {
  assigne: { label: 'En attente de confirmation', className: 'bg-amber-500/20 text-amber-300' },
  accepte: { label: 'Accepté', className: 'bg-sky-500/20 text-sky-300' },
  en_cours: { label: 'Session en cours', className: 'bg-violet-500/20 text-violet-300' },
};

const TRAINING_STATUT_MAP: Record<string, StatusBadgeConfig> = {
  open: { label: 'Session ouverte', className: 'bg-emerald-500/20 text-emerald-300' },
};

const KIND_LABELS: Record<AdminOpenDemande['kind'], string> = {
  exam: 'Examen',
  pilot_training: 'Training vol',
  atc_training: 'Training ATC',
};

type StaffCandidate = {
  id: string;
  identifiant: string;
  trained_conflict?: boolean;
  currently_assigned?: boolean;
  tier?: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function staffAssignUrl(kind: AdminOpenDemande['kind'], id: string): string {
  if (kind === 'exam') return `/api/instruction/exam-requests/${id}/staff-assign`;
  if (kind === 'pilot_training') return `/api/instruction/pilot-trainings/${id}/staff-assign`;
  return `/api/instruction/atc-trainings/${id}/staff-assign`;
}

function cancelUrl(kind: AdminOpenDemande['kind'], id: string): string {
  if (kind === 'exam') return `/api/instruction/exam-requests/${id}`;
  if (kind === 'pilot_training') return `/api/instruction/pilot-trainings/${id}`;
  return `/api/instruction/atc-trainings/${id}`;
}

function canAdminCancel(d: AdminOpenDemande): boolean {
  if (d.kind !== 'exam') return true;
  return d.statut !== 'en_cours' && d.statut !== 'termine' && d.statut !== 'refuse';
}

interface AdminDemandesTabProps {
  adminOpenDemandes: AdminOpenDemande[];
  adminStaffPools?: AdminStaffReassignPools;
  adminExamTrainerConflicts?: AdminExamTrainerConflicts;
}

export default function AdminDemandesTab({
  adminOpenDemandes,
  adminStaffPools = EMPTY_POOLS,
  adminExamTrainerConflicts = {},
}: AdminDemandesTabProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const [pick, setPick] = useState<Record<string, string>>({});
  const [force, setForce] = useState<Record<string, boolean>>({});

  const [cancelTarget, setCancelTarget] = useState<AdminOpenDemande | null>(null);
  const [cancelAck, setCancelAck] = useState(false);

  const candidates = useMemo(() => {
    const result: Record<string, StaffCandidate[]> = {};
    for (const d of adminOpenDemandes) {
      if (!d.reassignable) continue;
      const key = `${d.kind}:${d.id}`;
      result[key] = buildAdminReassignCandidates(
        d.kind,
        d.requester_id,
        d.assignee_id,
        d.licence_code,
        adminStaffPools,
        adminExamTrainerConflicts,
      );
    }
    return result;
  }, [adminOpenDemandes, adminStaffPools, adminExamTrainerConflicts]);

  const sortedDemandes = useMemo(
    () => [...adminOpenDemandes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [adminOpenDemandes],
  );

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

  async function reassignDemande(d: AdminOpenDemande) {
    const key = `${d.kind}:${d.id}`;
    const assigneeId = pick[key];
    if (!assigneeId) {
      toast.error('Choisissez un instructeur.');
      return;
    }

    const candidate = (candidates[key] || []).find((c) => c.id === assigneeId);
    const isExam = d.kind === 'exam';
    const forceVal = Boolean(force[key]);

    if (isExam && candidate?.trained_conflict && !forceVal) {
      toast.error(
        'Cet instructeur a formé le candidat sur cette licence. Cochez « Forcer » uniquement en cas exceptionnel.',
      );
      return;
    }

    if (isExam && candidate?.trained_conflict && forceVal) {
      if (
        !window.confirm(
          'ATTENTION : vous allez forcer l’assignation d’un instructeur qui a formé ce candidat sur cette licence. Confirmer ?',
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        isExam
          ? 'Réassigner cette demande à l’examinateur choisi ? La demande repassera en « à confirmer ».'
          : 'Réassigner cette session de training à l’instructeur choisi ?',
      )
    ) {
      return;
    }

    await run(async () => {
      const body: Record<string, unknown> = isExam
        ? { instructeur_id: assigneeId, force: forceVal }
        : { assignee_id: assigneeId };

      const res = await fetch(staffAssignUrl(d.kind, d.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erreur de réassignation');

      setPick((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      setForce((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      toast.success(
        (data as { forced?: boolean }).forced
          ? 'Instructeur réassigné (contournement forcé).'
          : 'Instructeur réassigné.',
      );
    });
  }

  function openCancelModal(d: AdminOpenDemande) {
    if (!canAdminCancel(d)) {
      toast.error(
        d.kind === 'exam' && d.statut === 'en_cours'
          ? 'Impossible d’annuler une session d’examen en cours.'
          : 'Cette demande ne peut pas être annulée.',
      );
      return;
    }
    setCancelAck(false);
    setCancelTarget(d);
  }

  async function confirmCancel() {
    if (!cancelTarget || !cancelAck) {
      toast.error('Cochez la case de confirmation avant d’annuler.');
      return;
    }
    const d = cancelTarget;
    await run(async () => {
      const res = await fetch(cancelUrl(d.kind, d.id), { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erreur d’annulation');
      setCancelTarget(null);
      setCancelAck(false);
      toast.success(
        d.kind === 'exam'
          ? 'Demande d’examen annulée.'
          : 'Session de training annulée.',
      );
    });
  }

  return (
    <>
      <div className="card space-y-4 border-l-4 border-l-orange-500/60 min-w-0">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10 shrink-0">
            <Shield className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-100">Administration — Demandes ouvertes</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Sessions de training et examens en attente. Réassignez ou annulez une demande depuis cette vue.
            </p>
            <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <span>Training vol : tous les FI</span>
              <span>Training ATC : tous les ATC FI</span>
              <span>Examens vol : tous les FE</span>
              <span>Examens ATC : tous les ATC FE</span>
            </p>
          </div>
          {sortedDemandes.length > 0 && (
            <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-300 font-medium">
              {sortedDemandes.length}
            </span>
          )}
        </div>

        {sortedDemandes.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune demande ouverte pour le moment.</p>
        ) : (
          <div className="space-y-3 min-w-0">
            {sortedDemandes.map((d) => {
              const key = `${d.kind}:${d.id}`;
              const selected = pick[key] || '';
              const picked = (candidates[key] || []).find((c) => c.id === selected);
              const effectiveStatut = d.kind === 'exam' ? d.statut || 'assigne' : 'open';
              const licenceHint = assigneeLicenceHint(d.kind, d.licence_code, { admin: true });

              return (
                <article
                  key={key}
                  className="rounded-xl border border-slate-700/50 bg-slate-800/10 p-4 space-y-3 hover:bg-slate-800/20 transition-colors min-w-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {d.requester_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.requester_photo_url}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover border border-slate-600/60 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-slate-700/60 flex items-center justify-center shrink-0">
                          <UserRound className="h-4 w-4 text-slate-500" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Élève</p>
                        <p className="text-slate-200 font-medium truncate">{d.requester_identifiant}</p>
                        {d.message && (
                          <DemandeRaisonButton
                            message={d.message}
                            auteur={d.requester_identifiant}
                            compact
                          />
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {canAdminCancel(d) ? (
                        <button
                          type="button"
                          className="btn-secondary text-xs text-red-300 border-red-500/30 flex items-center gap-1"
                          disabled={loading}
                          onClick={() => openCancelModal(d)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Annuler
                        </button>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {d.kind === 'exam' && d.statut === 'en_cours'
                            ? 'Session en cours'
                            : '—'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3 text-sm min-w-0">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Type</p>
                      <p className="text-slate-300 mt-0.5">{KIND_LABELS[d.kind]}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Licence</p>
                      <p className="text-slate-300 font-medium mt-0.5">{d.licence_code}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Statut</p>
                      <div className="mt-1">
                        <StatusBadge
                          status={effectiveStatut}
                          map={d.kind === 'exam' ? EXAM_STATUT_MAP : TRAINING_STATUT_MAP}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Instructeur</p>
                      <p className="text-slate-400 mt-0.5 truncate">{d.assignee_identifiant || '—'}</p>
                    </div>
                    <div className="min-w-0 col-span-2 sm:col-span-1">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Dates</p>
                      <p className="text-xs text-slate-500 mt-0.5">Créée {formatDate(d.created_at)}</p>
                      {d.updated_at !== d.created_at && (
                        <p className="text-xs text-slate-500 mt-0.5">Màj {formatDate(d.updated_at)}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-700/40 min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Réassignation</p>
                    {!d.reassignable ? (
                      <p className="text-xs text-slate-500">
                        {d.kind === 'exam' && d.statut === 'en_cours'
                          ? 'Session en cours — réassignation indisponible.'
                          : 'Non réassignable.'}
                      </p>
                    ) : (
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <select
                            className="input text-sm w-full sm:w-auto sm:flex-1 sm:max-w-md min-w-0"
                            title={licenceHint}
                            aria-label={licenceHint}
                            value={selected}
                            onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}
                            disabled={loading}
                          >
                            <option value="">— Choisir —</option>
                            {(candidates[key] || [])
                              .filter((c) => !c.currently_assigned)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.identifiant}
                                  {c.tier ? ` (${c.tier})` : ''}
                                  {c.trained_conflict ? ' — a formé le candidat' : ''}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="btn-primary text-xs py-1.5 px-3 shrink-0"
                            disabled={loading || !selected}
                            onClick={() => reassignDemande(d)}
                          >
                            Réassigner
                          </button>
                        </div>
                        {d.kind === 'exam' && picked?.trained_conflict && (
                          <label className="flex items-start gap-2 text-xs text-amber-200/90">
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-slate-600 shrink-0"
                              checked={Boolean(force[key])}
                              onChange={(e) => setForce((p) => ({ ...p, [key]: e.target.checked }))}
                            />
                            <span>Forcer malgré conflit formateur ≠ examinateur</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100">
              Annuler cette demande ?
            </h3>
            <p className="text-sm text-slate-400">
              {KIND_LABELS[cancelTarget.kind]} · {cancelTarget.licence_code} ·{' '}
              <span className="text-slate-200">{cancelTarget.requester_identifiant}</span>
            </p>
            <p className="text-sm text-slate-300">
              Cette action est définitive : la demande disparaîtra de la liste des demandes ouvertes
              et l’élève pourra en créer une nouvelle.
            </p>
            <label className="flex items-start gap-2 text-sm text-amber-200/90 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-600"
                checked={cancelAck}
                onChange={(e) => setCancelAck(e.target.checked)}
              />
              <span>
                Je confirme vouloir annuler définitivement cette demande
                {cancelTarget.kind === 'exam' ? ' d’examen' : ' de training'}.
              </span>
            </label>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50"
                disabled={loading || !cancelAck}
                onClick={() => void confirmCancel()}
              >
                {loading ? 'Annulation…' : 'Confirmer l’annulation'}
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                disabled={loading}
                onClick={() => {
                  setCancelTarget(null);
                  setCancelAck(false);
                }}
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
