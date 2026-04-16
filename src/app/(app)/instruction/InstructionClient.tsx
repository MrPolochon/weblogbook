'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { InstructionProgram } from '@/lib/instruction-programs';

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
  programs,
  examLicenceOptions,
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
  programs: InstructionProgram[];
  examLicenceOptions: string[];
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
  const isManager = viewerRole === 'instructeur' || viewerRole === 'admin';

  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [formationLicence, setFormationLicence] = useState('PPL');
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
                  <p className="text-xs text-slate-500">Instructeur: {instructeur?.identifiant || 'Assignation en cours'}</p>
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

      {isManager && (
        <>
          <form onSubmit={createEleve} className="card space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Créer un élève</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} placeholder="Identifiant élève" required />
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe temporaire" required minLength={8} />
              <select className="input" value={formationLicence} onChange={(e) => setFormationLicence(e.target.value)}>
                {programs.map((p) => (
                  <option key={p.licenceCode} value={p.licenceCode}>{p.label}</option>
                ))}
              </select>
              <button className="btn-primary" type="submit" disabled={loading}>Créer l&apos;élève</button>
            </div>
          </form>

          <form onSubmit={addAvionTemp} className="card space-y-3">
            <h2 className="text-lg font-medium text-slate-200">Assigner un avion temporaire</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select className="input" value={selectedEleveId} onChange={(e) => setSelectedEleveId(e.target.value)} required>
                <option value="">Élève</option>
                {eleves.filter((e) => e.formation_instruction_active).map((e) => (
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
                      {programs.map((p) => (
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

      {isManager && (
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
                      <div className="flex gap-2">
                        <button type="button" className="btn-primary" disabled={loading} onClick={() => acceptExam(r.id)}>
                          Confirmer la demande
                        </button>
                        <button type="button" className="btn-secondary" disabled={loading} onClick={() => refuseExam(r.id)}>
                          Refuser
                        </button>
                      </div>
                    )}

                    {r.statut === 'accepte' && (
                      <button type="button" className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50" disabled={loading} onClick={() => startExamSession(r.id)}>
                        Démarrer la session d&apos;examen
                      </button>
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
