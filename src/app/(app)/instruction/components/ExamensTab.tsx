'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Award, FileCheck2, Shield } from 'lucide-react';
import type { ExamRequestAssigned, ExamRequestStaffOpen, ExamFinishDialog } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import type { StatusBadgeConfig } from '@/components/StatusBadge';

const EXAM_ASSIGNED_STATUT_MAP: Record<string, StatusBadgeConfig> = {
  assigne: { label: 'Nouvelle demande', className: 'bg-amber-500/20 text-amber-300' },
  accepte: { label: 'Accepté — Prêt à démarrer', className: 'bg-sky-500/20 text-sky-300' },
  en_cours: { label: 'Session en cours', className: 'bg-violet-500/20 text-violet-300' },
  termine_reussi: { label: 'Réussi', className: 'bg-emerald-500/20 text-emerald-300' },
  termine_echoue: { label: 'Échoué', className: 'bg-red-500/20 text-red-300' },
  refuse: { label: 'Refusé', className: 'bg-red-500/20 text-red-300' },
};

type StaffCandidate = {
  id: string;
  identifiant: string;
  trained_conflict: boolean;
  currently_assigned?: boolean;
};

interface ExamensTabProps {
  instructionTitreOptions: string[];
  titresCiblesPilotes: Array<{ id: string; identifiant: string }>;
  viewerRole: string;
  canViewExaminerInbox: boolean;
  examRequestsAssigned: ExamRequestAssigned[];
  examRequestsStaffOpen?: ExamRequestStaffOpen[];
}

export default function ExamensTab({
  instructionTitreOptions,
  titresCiblesPilotes,
  viewerRole,
  canViewExaminerInbox,
  examRequestsAssigned,
  examRequestsStaffOpen = [],
}: ExamensTabProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const isStaffAdmin = viewerRole === 'admin';

  const [titreUserId, setTitreUserId] = useState('');
  const [titreType, setTitreType] = useState('FI');
  const [titreAVie, setTitreAVie] = useState(true);
  const [titreDateDeliv, setTitreDateDeliv] = useState(() => new Date().toISOString().split('T')[0]);
  const [titreDateExp, setTitreDateExp] = useState('');
  const [titreNote, setTitreNote] = useState('');

  const [examFinishDialog, setExamFinishDialog] = useState<ExamFinishDialog | null>(null);
  const [examResultForm, setExamResultForm] = useState({
    a_vie: false,
    date_delivrance: new Date().toISOString().split('T')[0],
    date_expiration: '',
    note: '',
  });
  const [examEchoueKeep, setExamEchoueKeep] = useState(true);
  const [examEchoueNote, setExamEchoueNote] = useState('');

  const [reassignCandidates, setReassignCandidates] = useState<
    Record<string, { id: string; identifiant: string }[]>
  >({});
  const [reassignPick, setReassignPick] = useState<Record<string, string>>({});
  const [reassignListLoading, setReassignListLoading] = useState<Record<string, boolean>>({});

  const [staffCandidates, setStaffCandidates] = useState<Record<string, StaffCandidate[]>>({});
  const [staffPick, setStaffPick] = useState<Record<string, string>>({});
  const [staffForce, setStaffForce] = useState<Record<string, boolean>>({});
  const [staffListLoading, setStaffListLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (instructionTitreOptions.length > 0 && !instructionTitreOptions.includes(titreType)) {
      setTitreType(instructionTitreOptions[0]!);
    }
  }, [instructionTitreOptions, titreType]);

  const reassignableExamRequestIds = useMemo(
    () =>
      examRequestsAssigned
        .filter((r) => r.statut === 'assigne' || r.statut === 'accepte')
        .map((r) => r.id)
        .sort()
        .join(','),
    [examRequestsAssigned],
  );

  useEffect(() => {
    const ids = reassignableExamRequestIds ? reassignableExamRequestIds.split(',').filter(Boolean) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const reqId of ids) {
        setReassignListLoading((L) => ({ ...L, [reqId]: true }));
        try {
          const res = await fetch(`/api/instruction/exam-requests/${reqId}/reassign`);
          const d = (await res.json().catch(() => ({}))) as {
            candidates?: { id: string; identifiant: string }[];
          };
          if (!cancelled && res.ok) {
            setReassignCandidates((c) => ({ ...c, [reqId]: d.candidates ?? [] }));
          }
        } finally {
          if (!cancelled) {
            setReassignListLoading((L) => ({ ...L, [reqId]: false }));
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [reassignableExamRequestIds]);

  const staffOpenIds = useMemo(
    () => examRequestsStaffOpen.map((r) => r.id).sort().join(','),
    [examRequestsStaffOpen],
  );

  useEffect(() => {
    if (!isStaffAdmin) return;
    const ids = staffOpenIds ? staffOpenIds.split(',').filter(Boolean) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const reqId of ids) {
        setStaffListLoading((L) => ({ ...L, [reqId]: true }));
        try {
          const res = await fetch(`/api/instruction/exam-requests/${reqId}/staff-assign`);
          const d = (await res.json().catch(() => ({}))) as { candidates?: StaffCandidate[] };
          if (!cancelled && res.ok) {
            setStaffCandidates((c) => ({ ...c, [reqId]: d.candidates ?? [] }));
          }
        } finally {
          if (!cancelled) {
            setStaffListLoading((L) => ({ ...L, [reqId]: false }));
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isStaffAdmin, staffOpenIds]);

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

  async function submitTitreDelivrance(e: React.FormEvent) {
    e.preventDefault();
    if (!titreUserId) {
      toast.error('Choisissez un pilote.');
      return;
    }
    if (
      !window.confirm(
        'Première confirmation : vous allez délivrer un titre FI, FE, ATC FI ou ATC FE sur le carnet du pilote. Continuer ?',
      )
    ) return;
    if (
      !window.confirm(
        'Deuxième confirmation : enregistrement définitif. Vous ne pourrez pas retirer ce titre ici (seul un administrateur peut le faire).',
      )
    ) return;
    await run(async () => {
      const res = await fetch('/api/licences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: titreUserId,
          type: titreType,
          a_vie: titreAVie,
          date_delivrance: titreDateDeliv || null,
          date_expiration: titreAVie ? null : titreDateExp || null,
          note: titreNote.trim() || null,
          double_confirm_instruction_titre: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erreur délivrance titre');
      toast.success('Titre enregistré sur le profil du pilote.');
    });
  }

  async function updateExamStatus(id: string, statut: string, extra?: Record<string, unknown>) {
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour examen');
      toast.success('Action effectuée.');
    });
  }

  async function acceptExam(id: string) { await updateExamStatus(id, 'accepte'); }
  async function refuseExam(id: string) { await updateExamStatus(id, 'refuse'); }
  async function startExamSession(id: string) { await updateExamStatus(id, 'en_cours'); }

  function openFinishDialog(requestId: string, requesterName: string, licenceCode: string) {
    setExamFinishDialog({ requestId, requesterName, licenceCode, step: 'choose_result' });
    setExamResultForm({ a_vie: false, date_delivrance: new Date().toISOString().split('T')[0], date_expiration: '', note: '' });
    setExamEchoueKeep(true);
    setExamEchoueNote('');
  }

  async function submitExamReussi() {
    if (!examFinishDialog) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${examFinishDialog.requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'termine',
          resultat: 'reussi',
          a_vie: examResultForm.a_vie,
          date_delivrance: examResultForm.date_delivrance,
          date_expiration: examResultForm.a_vie ? null : examResultForm.date_expiration,
          note: examResultForm.note || null,
          response_note: examResultForm.note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur validation examen');
      toast.success('Examen validé — Licence délivrée et message envoyé au pilote.');
      setExamFinishDialog(null);
    });
  }

  async function submitExamEchoue() {
    if (!examFinishDialog) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${examFinishDialog.requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'termine',
          resultat: 'echoue',
          dossier_conserve: examEchoueKeep,
          response_note: examEchoueNote || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur validation examen');
      toast.success('Examen échoué — Message envoyé au pilote.');
      setExamFinishDialog(null);
    });
  }

  async function reassignExamToColleague(requestId: string, instructeurId: string | undefined) {
    if (!instructeurId) {
      toast.error('Choisissez un examinateur dans la liste.');
      return;
    }
    if (
      !window.confirm(
        'Transmettre cette demande à cet examinateur ? Vous ne serez plus assigné. Le candidat et le nouvel examinateur recevront un message dans la messagerie. La demande repassera en « à confirmer » pour le collègue.',
      )
    ) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${requestId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructeur_id: instructeurId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'Erreur de transmission');
      setReassignPick((p) => {
        const next = { ...p };
        delete next[requestId];
        return next;
      });
      toast.success('Demande transmise. Le nouvel examinateur doit la confirmer.');
    });
  }

  async function staffReassignExam(requestId: string) {
    const instructeurId = staffPick[requestId];
    if (!instructeurId) {
      toast.error('Choisissez un examinateur.');
      return;
    }
    const candidate = (staffCandidates[requestId] || []).find((c) => c.id === instructeurId);
    const force = Boolean(staffForce[requestId]);
    if (candidate?.trained_conflict && !force) {
      toast.error(
        'Cet instructeur a formé le candidat sur cette licence. Cochez « Forcer » uniquement en cas exceptionnel.',
      );
      return;
    }
    if (candidate?.trained_conflict && force) {
      if (
        !window.confirm(
          'ATTENTION : vous allez forcer l’assignation d’un instructeur qui a formé ce candidat sur cette licence. Confirmer ce contournement exceptionnel ?',
        )
      ) return;
    } else if (
      !window.confirm(
        'Réassigner cette demande à l’examinateur choisi ? La demande repassera en « à confirmer ».',
      )
    ) {
      return;
    }
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${requestId}/staff-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructeur_id: instructeurId, force }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'Erreur de réassignation');
      setStaffPick((p) => {
        const next = { ...p };
        delete next[requestId];
        return next;
      });
      setStaffForce((p) => {
        const next = { ...p };
        delete next[requestId];
        return next;
      });
      toast.success(
        (d as { forced?: boolean }).forced
          ? 'Examinateur réassigné (contournement forcé).'
          : 'Examinateur réassigné.',
      );
    });
  }

  return (
    <>
      {isStaffAdmin && (
        <div className="card space-y-4 border-l-4 border-l-orange-500/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10"><Shield className="h-5 w-5 text-orange-400" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Admin — Réassigner un examinateur</h2>
              <p className="text-sm text-slate-500">
                Changez l&apos;examinateur d&apos;une demande ouverte. Par défaut, un instructeur ayant formé
                le candidat sur la même licence est bloqué (option « Forcer » pour cas exceptionnels).
              </p>
            </div>
            {examRequestsStaffOpen.length > 0 && (
              <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-300 font-medium">
                {examRequestsStaffOpen.length}
              </span>
            )}
          </div>
          {examRequestsStaffOpen.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune demande d&apos;examen ouverte (assigne / accepte).</p>
          ) : (
            <div className="space-y-3">
              {examRequestsStaffOpen.map((r) => {
                const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
                const instructeur = Array.isArray(r.instructeur) ? r.instructeur[0] : r.instructeur;
                const pick = staffPick[r.id] || '';
                const picked = (staffCandidates[r.id] || []).find((c) => c.id === pick);
                return (
                  <div key={r.id} className="rounded-lg border border-slate-700/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-slate-200 font-medium">
                          {requester?.identifiant || r.requester_id} · {r.licence_code}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Examinateur actuel :{' '}
                          <span className="text-slate-400">{instructeur?.identifiant || '—'}</span>
                        </p>
                      </div>
                      <StatusBadge status={r.statut} map={EXAM_ASSIGNED_STATUT_MAP} size="md" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <label className="flex-1 min-w-0 space-y-1 text-sm text-slate-400">
                        <span className="text-slate-500">Nouvel examinateur</span>
                        <select
                          className="input w-full"
                          value={pick}
                          onChange={(e) => setStaffPick((p) => ({ ...p, [r.id]: e.target.value }))}
                          disabled={loading || staffListLoading[r.id]}
                        >
                          <option value="">— Choisir —</option>
                          {(staffCandidates[r.id] || [])
                            .filter((c) => !c.currently_assigned)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.identifiant}
                                {c.trained_conflict ? ' (a formé le candidat)' : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn-primary shrink-0 h-[42px]"
                        disabled={loading || staffListLoading[r.id] || !pick}
                        onClick={() => staffReassignExam(r.id)}
                      >
                        Réassigner
                      </button>
                    </div>
                    {picked?.trained_conflict && (
                      <label className="flex items-start gap-2 text-sm text-amber-200/90">
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-slate-600"
                          checked={Boolean(staffForce[r.id])}
                          onChange={(e) =>
                            setStaffForce((p) => ({ ...p, [r.id]: e.target.checked }))
                          }
                        />
                        <span>
                          Forcer malgré le conflit training (exceptionnel — confirmation obligatoire)
                        </span>
                      </label>
                    )}
                    {staffListLoading[r.id] && (
                      <p className="text-xs text-slate-500">Chargement des examinateurs…</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {instructionTitreOptions.length > 0 && (
        <form onSubmit={submitTitreDelivrance} className="card space-y-4 border-l-4 border-l-violet-500/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10"><Award className="h-5 w-5 text-violet-400" /></div>
            <h2 className="text-lg font-semibold text-slate-100">Délivrance titre FI / FE / ATC</h2>
          </div>
          <p className="text-sm text-amber-200/90">
            Réservé aux administrateurs et aux titulaires concernés (FE pour FI et FE vol ; ATC FE pour ATC FI et
            ATC FE). Vous ne pouvez pas retirer ces titres ici : contactez un administrateur si une erreur a été
            enregistrée.
          </p>
          {titresCiblesPilotes.length === 0 ? (
            <p className="text-sm text-slate-500">
              {viewerRole === 'admin'
                ? "Aucun profil chargé. Rechargez la page ou corrigez les droits d'accès base de données."
                : "Aucun élève actif rattaché à vous comme instructeur référent. Rattachez d'abord un élève ou demandez un administrateur."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1 text-sm text-slate-300">
                  Pilote
                  <select
                    className="input w-full"
                    value={titreUserId}
                    onChange={(e) => setTitreUserId(e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {titresCiblesPilotes.map((p) => (
                      <option key={p.id} value={p.id}>{p.identifiant}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm text-slate-300">
                  Titre
                  <select
                    className="input w-full"
                    value={titreType}
                    onChange={(e) => setTitreType(e.target.value)}
                    required
                  >
                    {instructionTitreOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                  <input
                    type="checkbox"
                    className="rounded border-slate-600"
                    checked={titreAVie}
                    onChange={(e) => setTitreAVie(e.target.checked)}
                  />
                  À vie
                </label>
                <label className="space-y-1 text-sm text-slate-300">
                  Date de délivrance
                  <input
                    type="date"
                    className="input w-full"
                    value={titreDateDeliv}
                    onChange={(e) => setTitreDateDeliv(e.target.value)}
                    required
                  />
                </label>
                {!titreAVie && (
                  <label className="space-y-1 text-sm text-slate-300">
                    Date d&apos;expiration
                    <input
                      type="date"
                      className="input w-full"
                      value={titreDateExp}
                      onChange={(e) => setTitreDateExp(e.target.value)}
                      required={!titreAVie}
                    />
                  </label>
                )}
                <label className="space-y-1 text-sm text-slate-300 md:col-span-2">
                  Note (optionnel)
                  <input
                    className="input w-full"
                    value={titreNote}
                    onChange={(e) => setTitreNote(e.target.value)}
                    placeholder="Réf. dossier, session…"
                  />
                </label>
              </div>
              <button className="btn-primary" type="submit" disabled={loading}>
                Enregistrer le titre (double confirmation)
              </button>
            </>
          )}
        </form>
      )}

      {canViewExaminerInbox && (
        <div className="card space-y-4 border-l-4 border-l-rose-500/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10"><FileCheck2 className="h-5 w-5 text-rose-400" /></div>
            <h2 className="text-lg font-semibold text-slate-100">Demandes d&apos;examen assignées</h2>
            {examRequestsAssigned.length > 0 && (
              <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 font-medium">{examRequestsAssigned.length}</span>
            )}
          </div>
          {examRequestsAssigned.length === 0 ? (
            <p className="text-slate-500">Aucune demande assignée.</p>
          ) : (
            <div className="space-y-3">
              {examRequestsAssigned.map((r) => {
                const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
                const requesterName = requester?.identifiant || r.requester_id;
                const effectiveStatut = r.statut === 'termine'
                  ? `termine_${r.resultat || 'unknown'}`
                  : r.statut;
                return (
                  <div key={r.id} className="rounded-lg border border-slate-700/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-200 font-medium">{requesterName} · {r.licence_code}</p>
                        {r.message && <p className="text-sm text-slate-400 mt-1">Message: {r.message}</p>}
                      </div>
                      <StatusBadge status={effectiveStatut} map={EXAM_ASSIGNED_STATUT_MAP} size="md" />
                    </div>

                    {r.response_note && r.statut === 'termine' && (
                      <p className="text-sm text-sky-300">Note: {r.response_note}</p>
                    )}

                    {r.statut === 'assigne' && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" disabled={loading} onClick={() => acceptExam(r.id)}>
                          Confirmer la demande
                        </button>
                        <button type="button" className="btn-secondary" disabled={loading} onClick={() => refuseExam(r.id)}>
                          Refuser
                        </button>
                      </div>
                    )}

                    {r.statut === 'accepte' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50"
                          disabled={loading}
                          onClick={() => startExamSession(r.id)}
                        >
                          Démarrer la session d&apos;examen
                        </button>
                      </div>
                    )}

                    {(r.statut === 'assigne' || r.statut === 'accepte') && (
                      <div className="pt-3 border-t border-slate-700/50 space-y-2">
                        <p className="text-xs text-slate-500">Transmettre à un autre examinateur habilité (vous ne serez plus assigné à cette demande).</p>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                          <label className="flex-1 min-w-0 space-y-1 text-sm text-slate-400">
                            <span className="text-slate-500">Nouvel examinateur</span>
                            <select
                              className="input w-full"
                              value={reassignPick[r.id] || ''}
                              onChange={(e) => setReassignPick((p) => ({ ...p, [r.id]: e.target.value }))}
                              disabled={loading || reassignListLoading[r.id]}
                            >
                              <option value="">— Choisir un collègue —</option>
                              {(reassignCandidates[r.id] || []).map((c) => (
                                <option key={c.id} value={c.id}>{c.identifiant}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="btn-secondary shrink-0 h-[42px] self-stretch sm:self-end"
                            disabled={
                              loading ||
                              reassignListLoading[r.id] ||
                              !reassignPick[r.id] ||
                              (reassignCandidates[r.id]?.length ?? 0) === 0
                            }
                            onClick={() => reassignExamToColleague(r.id, reassignPick[r.id])}
                            title="Transmettre la demande à l'examinateur choisi"
                          >
                            Transmettre
                          </button>
                        </div>
                        {reassignListLoading[r.id] && <p className="text-xs text-slate-500">Chargement de la liste…</p>}
                        {!reassignListLoading[r.id] &&
                          reassignCandidates[r.id] &&
                          reassignCandidates[r.id].length === 0 && (
                            <p className="text-xs text-amber-500/90">Aucun autre examinateur habilité n&apos;est disponible.</p>
                          )}
                      </div>
                    )}

                    {r.statut === 'en_cours' && (
                      <div className="space-y-2">
                        <p className="text-sm text-violet-300">La session est en cours. Quand le vol est terminé, validez la fin de session.</p>
                        <button type="button" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50" disabled={loading} onClick={() => openFinishDialog(r.id, requesterName, r.licence_code)}>
                          Terminer la session
                        </button>
                      </div>
                    )}

                    {r.statut === 'termine' && r.resultat === 'echoue' && r.dossier_conserve && (
                      <p className="text-xs text-slate-500">Dossier conservé — le pilote peut vous recontacter.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {examFinishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl">
            {examFinishDialog.step === 'choose_result' && (
              <>
                <h3 className="text-xl font-semibold text-slate-100">
                  Résultat de l&apos;examen {examFinishDialog.licenceCode}
                </h3>
                <p className="text-sm text-slate-400">
                  Candidat: <span className="text-slate-200">{examFinishDialog.requesterName}</span>
                </p>
                <p className="text-slate-300">Le candidat a-t-il réussi l&apos;examen ?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                    onClick={() => setExamFinishDialog({ ...examFinishDialog, step: 'form_reussi' })}
                  >
                    Réussi
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                    onClick={() => setExamFinishDialog({ ...examFinishDialog, step: 'form_echoue' })}
                  >
                    Échoué
                  </button>
                </div>
                <button
                  type="button"
                  className="w-full text-sm text-slate-500 hover:text-slate-300"
                  onClick={() => setExamFinishDialog(null)}
                >
                  Annuler
                </button>
              </>
            )}

            {examFinishDialog.step === 'form_reussi' && (
              <>
                <h3 className="text-xl font-semibold text-emerald-400">
                  Délivrance de licence — {examFinishDialog.licenceCode}
                </h3>
                <p className="text-sm text-slate-400">
                  Candidat: <span className="text-slate-200">{examFinishDialog.requesterName}</span>
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Date de délivrance</label>
                    <input
                      type="date"
                      className="input w-full"
                      value={examResultForm.date_delivrance}
                      onChange={(e) => setExamResultForm((f) => ({ ...f, date_delivrance: e.target.value }))}
                      required
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={examResultForm.a_vie}
                      onChange={(e) => setExamResultForm((f) => ({ ...f, a_vie: e.target.checked }))}
                    />
                    <span className="text-sm text-slate-300">Licence à vie</span>
                  </label>
                  {!examResultForm.a_vie && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Date d&apos;expiration</label>
                      <input
                        type="date"
                        className="input w-full"
                        value={examResultForm.date_expiration}
                        onChange={(e) => setExamResultForm((f) => ({ ...f, date_expiration: e.target.value }))}
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Note (optionnel)</label>
                    <textarea
                      className="input w-full"
                      rows={2}
                      value={examResultForm.note}
                      onChange={(e) => setExamResultForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="Remarques sur l'examen..."
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50"
                    disabled={loading || !examResultForm.date_delivrance || (!examResultForm.a_vie && !examResultForm.date_expiration)}
                    onClick={submitExamReussi}
                  >
                    {loading ? 'Validation...' : 'Valider et délivrer la licence'}
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    onClick={() => setExamFinishDialog({ ...examFinishDialog, step: 'choose_result' })}
                  >
                    Retour
                  </button>
                </div>
              </>
            )}

            {examFinishDialog.step === 'form_echoue' && (
              <>
                <h3 className="text-xl font-semibold text-red-400">
                  Échec de l&apos;examen — {examFinishDialog.licenceCode}
                </h3>
                <p className="text-sm text-slate-400">
                  Candidat: <span className="text-slate-200">{examFinishDialog.requesterName}</span>
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">Que souhaitez-vous faire avec le dossier ?</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-800/50"
                        style={{ borderColor: examEchoueKeep ? 'rgb(139 92 246 / 0.5)' : 'rgb(51 65 85 / 0.6)' }}
                      >
                        <input
                          type="radio"
                          name="dossier"
                          checked={examEchoueKeep}
                          onChange={() => setExamEchoueKeep(true)}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-slate-200 font-medium">Garder le dossier</p>
                          <p className="text-xs text-slate-500">Le pilote pourra vous recontacter directement pour repasser l&apos;examen.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-800/50"
                        style={{ borderColor: !examEchoueKeep ? 'rgb(139 92 246 / 0.5)' : 'rgb(51 65 85 / 0.6)' }}
                      >
                        <input
                          type="radio"
                          name="dossier"
                          checked={!examEchoueKeep}
                          onChange={() => setExamEchoueKeep(false)}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-slate-200 font-medium">Supprimer le dossier</p>
                          <p className="text-xs text-slate-500">Le pilote devra refaire une nouvelle demande (possiblement avec un autre instructeur).</p>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Note pour le pilote (optionnel)</label>
                    <textarea
                      className="input w-full"
                      rows={2}
                      value={examEchoueNote}
                      onChange={(e) => setExamEchoueNote(e.target.value)}
                      placeholder="Raison de l'échec, conseils..."
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50"
                    disabled={loading}
                    onClick={submitExamEchoue}
                  >
                    {loading ? 'Validation...' : 'Confirmer l\'échec'}
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    onClick={() => setExamFinishDialog({ ...examFinishDialog, step: 'choose_result' })}
                  >
                    Retour
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
