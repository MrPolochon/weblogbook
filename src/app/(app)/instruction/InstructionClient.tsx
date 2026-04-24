'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { InstructionProgram } from '@/lib/instruction-programs';
import { isAtcInstructionProgram } from '@/lib/instruction-programs';

type Eleve = {
  id: string;
  identifiant: string;
  formation_instruction_active: boolean;
  formation_instruction_licence: string | null;
  created_at: string;
};

type TypeAvion = {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
};

type AvionTemp = {
  id: string;
  proprietaire_id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  immatriculation: string | null;
  aeroport_actuel: string | null;
  statut: string | null;
  usure_percent: number | null;
  instruction_actif: boolean;
};

export default function InstructionClient({
  loadError,
  viewerRole,
  viewerId,
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
  eleves,
  typesAvion,
  avionsTemp,
  elevesProgression,
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
  pilotTrainingsMine: Array<Record<string, string | null | undefined>>;
  pilotTrainingsAssigned: Array<Record<string, string | null | undefined>>;
  atcTrainingsMine: Array<Record<string, string | null | undefined>>;
  atcTrainingsAssigned: Array<Record<string, string | null | undefined>>;
  myFormationActive: boolean;
  myFormationLicence: string | null;
  myInstructorIdentifiant: string | null;
  myProgression: Array<{ licence_code: string; module_code: string; completed: boolean }>;
  examRequestsMine: Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; resultat: string | null; dossier_conserve: boolean | null; licence_creee_id: string | null; created_at: string; updated_at: string; instructeur: { identifiant: string } | { identifiant: string }[] | null }>;
  examRequestsAssigned: Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; resultat: string | null; dossier_conserve: boolean | null; licence_creee_id: string | null; created_at: string; updated_at: string; requester: { identifiant: string } | { identifiant: string }[] | null }>;
  eleves: Eleve[];
  typesAvion: TypeAvion[];
  avionsTemp: AvionTemp[];
  elevesProgression: Array<{ eleve_id: string; licence_code: string; module_code: string; completed: boolean }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isManager = isManagerProp;
  const formationProgramsForCreate = createFormationPrograms.length > 0 ? createFormationPrograms : programs;
  const [atcTrainingMessage, setAtcTrainingMessage] = useState('');
  const [pilotTrainingMessage, setPilotTrainingMessage] = useState('');

  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [rattachUserId, setRattachUserId] = useState('');
  const [rattachCandidates, setRattachCandidates] = useState<Array<{ id: string; identifiant: string }>>([]);
  const [rattachCandidatesLoading, setRattachCandidatesLoading] = useState(false);
  const [formationLicence, setFormationLicence] = useState('PPL');
  const [formationLicenceRattach, setFormationLicenceRattach] = useState('PPL');
  const [selectedEleveId, setSelectedEleveId] = useState('');
  const [typeAvionId, setTypeAvionId] = useState('');
  const [nomPerso, setNomPerso] = useState('');
  const [immat, setImmat] = useState('');
  const [examLicence, setExamLicence] = useState(myFormationLicence || examLicenceOptions[0] || 'PPL');
  const [examMessage, setExamMessage] = useState('');
  const [examFinishDialog, setExamFinishDialog] = useState<{
    requestId: string;
    requesterName: string;
    licenceCode: string;
    step: 'choose_result' | 'form_reussi' | 'form_echoue';
  } | null>(null);
  const [examResultForm, setExamResultForm] = useState({
    a_vie: false,
    date_delivrance: new Date().toISOString().split('T')[0],
    date_expiration: '',
    note: '',
  });
  const [examEchoueKeep, setExamEchoueKeep] = useState(true);
  const [examEchoueNote, setExamEchoueNote] = useState('');
  const [editById, setEditById] = useState<Record<string, { nom: string; immat: string; aeroport: string }>>({});
  const [loading, setLoading] = useState(false);
  const [reassignCandidates, setReassignCandidates] = useState<
    Record<string, { id: string; identifiant: string }[]>
  >({});
  const [reassignPick, setReassignPick] = useState<Record<string, string>>({});
  const [reassignListLoading, setReassignListLoading] = useState<Record<string, boolean>>({});

  const instructionTitreOptions = useMemo(() => {
    const out: string[] = [];
    if (canGrantTitreInstructionFlight) {
      out.push('FI', 'FE');
    }
    if (canGrantTitreInstructionAtc) {
      out.push('ATC FI', 'ATC FE');
    }
    return out;
  }, [canGrantTitreInstructionFlight, canGrantTitreInstructionAtc]);

  const [titreUserId, setTitreUserId] = useState('');
  const [titreType, setTitreType] = useState('FI');
  const [titreAVie, setTitreAVie] = useState(true);
  const [titreDateDeliv, setTitreDateDeliv] = useState(() => new Date().toISOString().split('T')[0]);
  const [titreDateExp, setTitreDateExp] = useState('');
  const [titreNote, setTitreNote] = useState('');

  useEffect(() => {
    if (instructionTitreOptions.length > 0 && !instructionTitreOptions.includes(titreType)) {
      setTitreType(instructionTitreOptions[0]!);
    }
  }, [instructionTitreOptions, titreType]);

  /** Clé `eleveId::licence::module` → état affiché en avance de phase avant la réponse serveur */
  const [progressionOverrides, setProgressionOverrides] = useState<Record<string, boolean>>({});
  const [savingProgKeys, setSavingProgKeys] = useState<Set<string>>(() => new Set());

  const avionsByEleve = useMemo(() => {
    const map = new Map<string, AvionTemp[]>();
    for (const a of avionsTemp) {
      const arr = map.get(a.proprietaire_id) || [];
      arr.push(a);
      map.set(a.proprietaire_id, arr);
    }
    return map;
  }, [avionsTemp]);

  const elevesForAvion = useMemo(
    () =>
      eleves.filter(
        (e) => e.formation_instruction_licence && !isAtcInstructionProgram(e.formation_instruction_licence),
      ),
    [eleves],
  );

  const progressionByEleve = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of elevesProgression) {
      if (!row.completed) continue;
      const key = `${row.eleve_id}::${row.licence_code}`;
      const set = map.get(key) || new Set<string>();
      set.add(row.module_code);
      map.set(key, set);
    }
    for (const [rawKey, completed] of Object.entries(progressionOverrides)) {
      const parts = rawKey.split('::');
      if (parts.length !== 3) continue;
      const [eleveId, licenceCode, moduleCode] = parts;
      const mapKey = `${eleveId}::${licenceCode}`;
      const set = map.get(mapKey) || new Set<string>();
      if (completed) set.add(moduleCode);
      else set.delete(moduleCode);
      map.set(mapKey, set);
    }
    return map;
  }, [elevesProgression, progressionOverrides]);

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
    if (!isManager) return;
    let cancelled = false;
    setRattachCandidatesLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/instruction/eleves/rattach-candidates');
        const d = (await res.json().catch(() => ({}))) as { candidates?: { id: string; identifiant: string }[] };
        if (!cancelled && res.ok) {
          setRattachCandidates(d.candidates ?? []);
        }
      } finally {
        if (!cancelled) setRattachCandidatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isManager]);

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
    return () => {
      cancelled = true;
    };
  }, [reassignableExamRequestIds]);

  useEffect(() => {
    setProgressionOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const parts = key.split('::');
        if (parts.length !== 3) continue;
        const [eleveId, licenceCode, moduleCode] = parts;
        const want = next[key];
        const row = elevesProgression.find(
          (r) => r.eleve_id === eleveId && r.licence_code === licenceCode && r.module_code === moduleCode,
        );
        const serverCompleted = row?.completed ?? false;
        if (serverCompleted === want) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [elevesProgression]);

  const myProgram = useMemo(
    () => programs.find((p) => p.licenceCode === myFormationLicence) || null,
    [programs, myFormationLicence]
  );
  const myCompletedSet = useMemo(
    () => new Set(myProgression.filter((p) => p.completed).map((p) => p.module_code)),
    [myProgression]
  );
  const myProgressPercent = useMemo(() => {
    if (!myProgram || myProgram.modules.length === 0) return 0;
    return Math.round((myCompletedSet.size / myProgram.modules.length) * 100);
  }, [myProgram, myCompletedSet]);

  const canRequestPilotTraining = Boolean(
    myFormationActive && myFormationLicence && !isAtcInstructionProgram(myFormationLicence),
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

  async function createEleve(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/eleves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiant: identifiant.trim(),
          password,
          formation_instruction_licence: formationLicence,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur création élève');
      setIdentifiant('');
      setPassword('');
      toast.success('Eleve cree et rattache a votre formation.');
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
      toast.success('Demande envoyée. Un FI (prioritaire) ou FE est assigné selon la charge — convenez de la date en message privé.');
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
      toast.success('Demande envoyée. Un ATC FI/FE est assigné — convenez de la date en message privé.');
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

  async function annuleAtcTraining(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/atc-trainings/${id}`, { method: 'DELETE' });
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

  async function annulePilotTraining(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/pilot-trainings/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur annulation');
      toast.success('Demande annulée.');
    });
  }

  async function rattachCompteExistant(e: React.FormEvent) {
    e.preventDefault();
    if (!rattachUserId) {
      toast.error('Choisissez un compte dans la liste.');
      return;
    }
    const pickedId = rattachUserId;
    await run(async () => {
      const res = await fetch('/api/instruction/eleves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link_existing: true,
          existing_user_id: pickedId,
          formation_instruction_licence: formationLicenceRattach,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur rattachement');
      setRattachUserId('');
      setRattachCandidates((list) => list.filter((c) => c.id !== pickedId));
      toast.success('Compte rattaché à votre formation. Le rôle (ex. pilote) est conservé.');
    });
  }

  async function setEleveLicence(eleveId: string, licenceCode: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/eleves/${eleveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_licence', licence_code: licenceCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur changement licence');
      toast.success('Licence de formation mise a jour.');
    });
  }

  async function addAvionTemp(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/avions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eleve_id: selectedEleveId,
          type_avion_id: typeAvionId,
          nom_personnalise: nomPerso.trim() || null,
          immatriculation: immat.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur assignation avion');
      setTypeAvionId('');
      setNomPerso('');
      setImmat('');
      toast.success('Avion temporaire assigne.');
    });
  }

  async function saveAvion(id: string) {
    const v = editById[id];
    if (!v) return;
    await run(async () => {
      const res = await fetch('/api/instruction/avions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          nom_personnalise: v.nom,
          immatriculation: v.immat,
          aeroport_actuel: v.aeroport,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour avion');
      toast.success('Avion temporaire mis a jour.');
    });
  }

  async function removeAvion(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/avions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur suppression avion');
      toast.success('Avion temporaire supprime.');
    });
  }

  async function finishFormation(eleveId: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/eleves/${eleveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'terminer_formation' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur fin de formation');
      toast.success('Formation terminee: les avions temporaires ont ete retires.');
    });
  }

  function progressionToggleKey(eleveId: string, licenceCode: string, moduleCode: string) {
    return `${eleveId}::${licenceCode}::${moduleCode}`;
  }

  async function toggleProgression(eleveId: string, licenceCode: string, moduleCode: string, completed: boolean) {
    const key = progressionToggleKey(eleveId, licenceCode, moduleCode);
    setProgressionOverrides((o) => ({ ...o, [key]: completed }));
    setSavingProgKeys((s) => new Set(s).add(key));
    try {
      const res = await fetch('/api/instruction/progression', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eleve_id: eleveId,
          licence_code: licenceCode,
          module_code: moduleCode,
          completed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur progression');
      startTransition(() => router.refresh());
    } catch (e) {
      setProgressionOverrides((o) => {
        const next = { ...o };
        delete next[key];
        return next;
      });
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingProgKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
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

  async function cancelMyExamRequest(id: string) {
    if (!confirm('Annuler cette demande d\'examen ?')) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur annulation');
      toast.success('Demande d\'examen annulée.');
    });
  }

  async function acceptExam(id: string) {
    await updateExamStatus(id, 'accepte');
  }

  async function refuseExam(id: string) {
    await updateExamStatus(id, 'refuse');
  }

  async function startExamSession(id: string) {
    await updateExamStatus(id, 'en_cours');
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
    ) {
      return;
    }
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
    ) {
      return;
    }
    if (
      !window.confirm(
        'Deuxième confirmation : enregistrement définitif. Vous ne pourrez pas retirer ce titre ici (seul un administrateur peut le faire).',
      )
    ) {
      return;
    }
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

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="sticky top-0 z-10 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}
      

      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold text-slate-100">Instruction</h1>
        <p className="text-sm text-slate-400">Suivi de formation et demandes d&apos;examens.</p>
      </div>

      {instructionTitreOptions.length > 0 && (
        <form onSubmit={submitTitreDelivrance} className="card space-y-3">
          <h2 className="text-lg font-medium text-slate-200">Délivrance titre FI / FE / ATC</h2>
          <p className="text-sm text-amber-200/90">
            Réservé aux administrateurs et aux titulaires concernés (FE pour FI et FE vol ; ATC FE pour ATC FI et
            ATC FE). Vous ne pouvez pas retirer ces titres ici : contactez un administrateur si une erreur a été
            enregistrée.
          </p>
          {titresCiblesPilotes.length === 0 ? (
            <p className="text-sm text-slate-500">
              {viewerRole === 'admin'
                ? 'Aucun profil chargé. Rechargez la page ou corrigez les droits d’accès base de données.'
                : 'Aucun élève actif rattaché à vous comme instructeur référent. Rattachez d’abord un élève ou demandez un administrateur.'}
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
                      <option key={p.id} value={p.id}>
                        {p.identifiant}
                      </option>
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
                      <option key={t} value={t}>
                        {t}
                      </option>
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
                    Date d’expiration
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

      <form onSubmit={createExamRequest} className="card space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Demander un examen</h2>
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
        <div className="card space-y-3">
          <h2 className="text-lg font-medium text-slate-200">Ma progression ({myProgram.label})</h2>
          <p className="text-sm text-slate-400">
            Instructeur référent: <span className="text-slate-200">{myInstructorIdentifiant || '—'}</span> · Progression: <span className="text-emerald-300">{myProgressPercent}%</span>
          </p>
          <div className="space-y-2">
            {myProgram.modules.map((m) => (
              <div key={m.code} className="rounded border border-slate-700/60 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-slate-200 font-medium">{m.code} - {m.title}</p>
                  <p className="text-xs text-slate-500">{m.description}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${myCompletedSet.has(m.code) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}>
                  {myCompletedSet.has(m.code) ? 'Validé' : 'À faire'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Mes demandes d&apos;examen</h2>
        {examRequestsMine.length === 0 ? (
          <p className="text-slate-500">Aucune demande.</p>
        ) : (
          <div className="space-y-2">
            {examRequestsMine.map((r) => {
              const instructeur = Array.isArray(r.instructeur) ? r.instructeur[0] : r.instructeur;
              const statutLabel: Record<string, string> = {
                assigne: 'En attente de confirmation',
                accepte: 'Accepté — En attente de session',
                en_cours: 'Session en cours',
                termine: r.resultat === 'reussi' ? 'Réussi' : r.resultat === 'echoue' ? 'Échoué' : 'Terminé',
                refuse: 'Refusé',
              };
              const statutColor: Record<string, string> = {
                assigne: 'text-amber-400',
                accepte: 'text-sky-400',
                en_cours: 'text-violet-400',
                termine: r.resultat === 'reussi' ? 'text-emerald-400' : 'text-red-400',
                refuse: 'text-red-400',
              };
              return (
                <div key={r.id} className="rounded border border-slate-700/60 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-200 font-medium">{r.licence_code}</p>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${statutColor[r.statut] || 'text-slate-400'}`}>
                      {statutLabel[r.statut] || r.statut}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Examinateur: {instructeur?.identifiant || 'Assignation en cours'}</p>
                  {r.statut === 'en_cours' && (
                    <p className="text-sm text-violet-300 mt-1">Votre session d&apos;examen est en cours. Effectuez votre vol normalement.</p>
                  )}
                  {r.message && <p className="text-sm text-slate-400 mt-1">Demande: {r.message}</p>}
                  {r.response_note && <p className="text-sm text-sky-300 mt-1">Réponse: {r.response_note}</p>}
                  {(r.statut === 'assigne' || r.statut === 'accepte') && (
                    <button type="button" onClick={() => cancelMyExamRequest(r.id)} disabled={loading}
                      className="mt-2 px-3 py-1.5 rounded text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                      Annuler la demande
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(canRequestPilotTraining ||
        pilotTrainingsMine.length > 0 ||
        (isPilotTrainingInstructor && pilotTrainingsAssigned.length > 0)) && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium text-slate-200">Session de training (vol)</h2>
          <p className="text-sm text-slate-500">
            Réservé aux <strong className="text-slate-400">élèves en formation pilote</strong> (PPL, CPL, etc.). Un{' '}
            <strong className="text-slate-400">FI</strong> est choisi en priorité, sinon un{' '}
            <strong className="text-slate-400">FE</strong>, avec répartition équitable de la charge. Convenez d&apos;une
            date <strong>en message privé</strong>. L&apos;instructeur clôt la fiche ici à la fin.
          </p>
          {canRequestPilotTraining && (
            <form onSubmit={requestPilotTraining} className="space-y-2">
              <input
                className="input w-full"
                value={pilotTrainingMessage}
                onChange={(e) => setPilotTrainingMessage(e.target.value)}
                placeholder="Message (optionnel) pour l’instructeur"
              />
              <button className="btn-primary" type="submit" disabled={loading}>
                Demander une session de training
              </button>
            </form>
          )}
          {pilotTrainingsMine.length > 0 && (
            <div>
              <p className="text-sm text-slate-300 mb-2">Mes demandes en cours (vol)</p>
              <ul className="space-y-2 text-sm text-slate-400">
                {pilotTrainingsMine.map((t) => (
                  <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 border border-slate-700/50 rounded p-2">
                    <span>
                      Assigné à <span className="text-slate-200">{t.assignee_identifiant || '—'}</span>
                      {t.message ? <span className="block text-xs mt-1">{t.message}</span> : null}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-red-400 border border-red-500/30 rounded px-2 py-1"
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
              <p className="text-sm text-emerald-200/90 mb-2">Training vol à assurer (côté instructeur)</p>
              <ul className="space-y-2 text-sm text-slate-300">
                {pilotTrainingsAssigned.map((t) => (
                  <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 border border-emerald-500/30 rounded p-2">
                    <span>
                      Avec <span className="text-slate-100">{t.requester_identifiant || '—'}</span>
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
      )}

      <div className="card space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Session de training (ATC)</h2>
        <p className="text-sm text-slate-500">
          Tout le monde peut demander un accompagnement. Un <strong className="text-slate-400">ATC FI</strong> ou{' '}
          <strong className="text-slate-400">ATC FE</strong> est assigné automatiquement (répartition de charge) ; convenez
          d&apos;une date <strong>en message privé</strong>. L&apos;instructeur clôt la fiche ici quand c&apos;est
          fini (elle disparaît).
        </p>
        <form onSubmit={requestAtcTraining} className="space-y-2">
          <input
            className="input w-full"
            value={atcTrainingMessage}
            onChange={(e) => setAtcTrainingMessage(e.target.value)}
            placeholder="Message (optionnel) pour l’instructeur"
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            Demander une session de training
          </button>
        </form>
        {atcTrainingsMine.length > 0 && (
          <div>
            <p className="text-sm text-slate-300 mb-2">Mes demandes en cours</p>
            <ul className="space-y-2 text-sm text-slate-400">
              {atcTrainingsMine.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 border border-slate-700/50 rounded p-2">
                  <span>
                    Assigné à <span className="text-slate-200">{t.assignee_identifiant || '—'}</span>
                    {t.message ? <span className="block text-xs mt-1">{t.message}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-400 border border-red-500/30 rounded px-2 py-1"
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
            <p className="text-sm text-amber-200/90 mb-2">Training à assurer (côté instructeur)</p>
            <ul className="space-y-2 text-sm text-slate-300">
              {atcTrainingsAssigned.map((t) => (
                <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 border border-amber-500/30 rounded p-2">
                  <span>
                    Avec <span className="text-slate-100">{t.requester_identifiant || '—'}</span>
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

      {isManager && (
        <>
          <form onSubmit={createEleve} className="card space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Créer un élève</h2>
            <p className="text-sm text-slate-500">
              Crée un <strong className="text-slate-400">nouveau</strong> compte dédié. Pour quelqu&apos;un qui a déjà un compte pilote (ex. PPL), préférez le rattachement ci-dessous.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} placeholder="Identifiant élève" required />
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe temporaire" required minLength={8} />
              <select className="input" value={formationLicence} onChange={(e) => setFormationLicence(e.target.value)}>
                {formationProgramsForCreate.map((p) => (
                  <option key={p.licenceCode} value={p.licenceCode}>{p.label}</option>
                ))}
              </select>
              <button className="btn-primary" type="submit" disabled={loading}>Créer l&apos;élève</button>
            </div>
          </form>

          <form onSubmit={rattachCompteExistant} className="card space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Rattacher un compte existant</h2>
            <p className="text-sm text-slate-500">
              Associe un pilote (ou un autre compte non administrateur) déjà inscrit sur le site à votre formation, sans doublon de compte. Son carnet et son identifiant restent les mêmes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="min-w-0 space-y-1 text-sm text-slate-400">
                <span className="text-slate-500">Compte existant</span>
                <select
                  className="input w-full"
                  value={rattachUserId}
                  onChange={(e) => setRattachUserId(e.target.value)}
                  disabled={loading || rattachCandidatesLoading}
                  required
                >
                  <option value="">— Choisir un compte —</option>
                  {rattachCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.identifiant}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 space-y-1 text-sm text-slate-400">
                <span className="text-slate-500">Parcours</span>
                <select
                  className="input w-full"
                  value={formationLicenceRattach}
                  onChange={(e) => setFormationLicenceRattach(e.target.value)}
                >
                  {formationProgramsForCreate.map((p) => (
                    <option key={p.licenceCode} value={p.licenceCode}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  className="btn-primary w-full"
                  type="submit"
                  disabled={loading || rattachCandidatesLoading || rattachCandidates.length === 0}
                >
                  Rattacher à ma formation
                </button>
              </div>
            </div>
            {rattachCandidatesLoading && (
              <p className="text-xs text-slate-500">Chargement de la liste des comptes…</p>
            )}
            {!rattachCandidatesLoading && rattachCandidates.length === 0 && (
              <p className="text-xs text-amber-500/90">
                Aucun compte éligible : compte admin, déjà en formation chez un autre instructeur, ou déjà parmi vos élèves
                actifs. Les autres comptes apparaissent ici dès qu’ils sont éligibles.
              </p>
            )}
          </form>

          {elevesForAvion.some((e) => e.formation_instruction_active) ? (
          <form onSubmit={addAvionTemp} className="card space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Assigner un avion temporaire</h2>
            <p className="text-xs text-slate-500">Réservé aux parcours <strong className="text-slate-400">vol</strong> (PPL, CPL, etc.), pas à la formation ATC-INIT.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select className="input" value={selectedEleveId} onChange={(e) => setSelectedEleveId(e.target.value)} required>
                <option value="">Élève</option>
                {elevesForAvion.filter((e) => e.formation_instruction_active).map((e) => (
                  <option key={e.id} value={e.id}>{e.identifiant}</option>
                ))}
              </select>
              <select className="input" value={typeAvionId} onChange={(e) => setTypeAvionId(e.target.value)} required>
                <option value="">Type avion</option>
                {typesAvion.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}{t.code_oaci ? ` (${t.code_oaci})` : ''}{t.constructeur ? ` - ${t.constructeur}` : ''}
                  </option>
                ))}
              </select>
              <input className="input" value={immat} onChange={(e) => setImmat(e.target.value.toUpperCase())} placeholder="Immatriculation (optionnel)" />
              <input className="input" value={nomPerso} onChange={(e) => setNomPerso(e.target.value)} placeholder="Nom personnalisé (optionnel)" />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>Assigner</button>
          </form>
          ) : isManager ? (
            <p className="text-sm text-slate-500 card py-3 px-4 border border-slate-700/40">
              Aucun élève en formation <strong className="text-slate-400">vol</strong> actif : l’assignation d’avion temporaire ne s’applique pas aux seuls parcours ATC-INIT.
            </p>
          ) : null}
        </>
      )}

      {isManager && (
        <div className="card space-y-4">
          <h2 className="text-lg font-medium text-slate-200">Élèves en formation</h2>
          {eleves.length === 0 && <p className="text-slate-500">Aucun élève rattaché.</p>}
          {eleves.map((e) => {
            const avions = avionsByEleve.get(e.id) || [];
            const licenceCode = e.formation_instruction_licence || 'PPL';
            const program = programs.find((p) => p.licenceCode === licenceCode) || null;
            const key = `${e.id}::${licenceCode}`;
            const completedSet = progressionByEleve.get(key) || new Set<string>();
            return (
              <div key={e.id} className="rounded-lg border border-slate-700/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-slate-100 font-medium">{e.identifiant}</p>
                    <p className="text-xs text-slate-500">{e.formation_instruction_active ? 'Formation active' : 'Formation terminée'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="input"
                      value={licenceCode}
                      onChange={(ev) => setEleveLicence(e.id, ev.target.value)}
                      disabled={loading}
                    >
                      {formationProgramsForCreate.map((p) => (
                        <option key={p.licenceCode} value={p.licenceCode}>{p.label}</option>
                      ))}
                    </select>
                    {e.formation_instruction_active && (
                      <button className="btn-secondary" type="button" disabled={loading} onClick={() => finishFormation(e.id)}>
                        Terminer la formation
                      </button>
                    )}
                  </div>
                </div>

                {program && (
                  <div className="rounded border border-slate-700/60 p-3 space-y-2">
                    <p className="text-sm text-slate-300">Progression {program.label}</p>
                    {program.modules.map((m) => {
                      const checked = completedSet.has(m.code);
                      return (
                        <label key={m.code} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(ev) => toggleProgression(e.id, licenceCode, m.code, ev.target.checked)}
                            disabled={loading || savingProgKeys.has(progressionToggleKey(e.id, licenceCode, m.code))}
                          />
                          <span className="text-sm text-slate-300">{m.code} - {m.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {avions.length === 0 && <p className="text-sm text-slate-500">Aucun avion temporaire assigné.</p>}
                {avions.map((a) => {
                  const type = typesAvion.find((t) => t.id === a.type_avion_id);
                  const edit = editById[a.id] || {
                    nom: a.nom_personnalise || '',
                    immat: a.immatriculation || '',
                    aeroport: a.aeroport_actuel || 'IRFD',
                  };
                  return (
                    <div key={a.id} className="rounded border border-slate-700/60 p-3 space-y-2">
                      <p className="text-sm text-slate-300">{type?.nom || 'Type inconnu'}</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                          className="input"
                          value={edit.immat}
                          onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, immat: ev.target.value.toUpperCase() } }))}
                          placeholder="Immatriculation"
                        />
                        <input
                          className="input"
                          value={edit.nom}
                          onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, nom: ev.target.value } }))}
                          placeholder="Nom personnalisé"
                        />
                        <input
                          className="input"
                          value={edit.aeroport}
                          onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, aeroport: ev.target.value.toUpperCase() } }))}
                          placeholder="Aéroport actuel"
                        />
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary" disabled={loading} onClick={() => saveAvion(a.id)}>Enregistrer</button>
                          <button type="button" className="btn-secondary" disabled={loading} onClick={() => removeAvion(a.id)}>Supprimer</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {canViewExaminerInbox && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium text-slate-200">Demandes d&apos;examen assignées</h2>
          {examRequestsAssigned.length === 0 ? (
            <p className="text-slate-500">Aucune demande assignée.</p>
          ) : (
            <div className="space-y-3">
              {examRequestsAssigned.map((r) => {
                const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
                const requesterName = requester?.identifiant || r.requester_id;
                return (
                  <div key={r.id} className="rounded-lg border border-slate-700/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-200 font-medium">{requesterName} · {r.licence_code}</p>
                        {r.message && <p className="text-sm text-slate-400 mt-1">Message: {r.message}</p>}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        r.statut === 'assigne' ? 'bg-amber-500/20 text-amber-300' :
                        r.statut === 'accepte' ? 'bg-sky-500/20 text-sky-300' :
                        r.statut === 'en_cours' ? 'bg-violet-500/20 text-violet-300' :
                        r.statut === 'termine' && r.resultat === 'reussi' ? 'bg-emerald-500/20 text-emerald-300' :
                        r.statut === 'termine' && r.resultat === 'echoue' ? 'bg-red-500/20 text-red-300' :
                        'bg-slate-700/60 text-slate-400'
                      }`}>
                        {r.statut === 'assigne' && 'Nouvelle demande'}
                        {r.statut === 'accepte' && 'Accepté — Prêt à démarrer'}
                        {r.statut === 'en_cours' && 'Session en cours'}
                        {r.statut === 'termine' && r.resultat === 'reussi' && 'Réussi'}
                        {r.statut === 'termine' && r.resultat === 'echoue' && 'Échoué'}
                        {r.statut === 'refuse' && 'Refusé'}
                      </span>
                    </div>

                    {r.response_note && r.statut === 'termine' && (
                      <p className="text-sm text-sky-300">Note: {r.response_note}</p>
                    )}

                    {/* Actions selon le statut */}
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
                                <option key={c.id} value={c.id}>
                                  {c.identifiant}
                                </option>
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
                            title="Transmettre la demande à l’examinateur choisi"
                          >
                            Transmettre
                          </button>
                        </div>
                        {reassignListLoading[r.id] && <p className="text-xs text-slate-500">Chargement de la liste…</p>}
                        {!reassignListLoading[r.id] &&
                          reassignCandidates[r.id] &&
                          reassignCandidates[r.id].length === 0 && (
                            <p className="text-xs text-amber-500/90">Aucun autre examinateur habilité n’est disponible.</p>
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

      {/* Dialogue de fin de session */}
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

    </div>
  );
}
