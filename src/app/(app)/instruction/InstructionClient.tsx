'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  examRequestsMine: Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; created_at: string; updated_at: string; instructeur: { identifiant: string } | { identifiant: string }[] | null }>;
  examRequestsAssigned: Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; created_at: string; updated_at: string; requester: { identifiant: string } | { identifiant: string }[] | null }>;
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
  const [examStatusEdit, setExamStatusEdit] = useState<Record<string, { statut: string; response_note: string }>>({});
  const [editById, setEditById] = useState<Record<string, { nom: string; immat: string; aeroport: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await action();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
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
      setSuccess('Élève créé et rattaché à votre formation.');
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
      setSuccess('Licence de formation mise à jour.');
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
      setSuccess('Avion temporaire assigné.');
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
      setSuccess('Avion temporaire mis à jour.');
    });
  }

  async function removeAvion(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/avions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur suppression avion');
      setSuccess('Avion temporaire supprimé.');
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
      setSuccess('Formation terminée: les avions temporaires ont été retirés.');
    });
  }

  function progressionToggleKey(eleveId: string, licenceCode: string, moduleCode: string) {
    return `${eleveId}::${licenceCode}::${moduleCode}`;
  }

  async function toggleProgression(eleveId: string, licenceCode: string, moduleCode: string, completed: boolean) {
    const key = progressionToggleKey(eleveId, licenceCode, moduleCode);
    setError(null);
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
      setError(e instanceof Error ? e.message : 'Erreur');
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
      setSuccess('Demande d’examen envoyée. Un instructeur vous a été assigné.');
    });
  }

  async function updateExamRequest(id: string) {
    const edit = examStatusEdit[id];
    if (!edit) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/exam-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: edit.statut,
          response_note: edit.response_note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour examen');
      setSuccess('Demande d’examen mise à jour.');
    });
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="sticky top-0 z-10 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}
      {error && (
        <div className="sticky top-0 z-10 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="sticky top-0 z-10 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {success}
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
              return (
                <div key={r.id} className="rounded border border-slate-700/60 p-3">
                  <p className="text-slate-200 font-medium">{r.licence_code} · {r.statut}</p>
                  <p className="text-xs text-slate-500">Instructeur: {instructeur?.identifiant || 'Assignation en cours'}</p>
                  {r.message && <p className="text-sm text-slate-400 mt-1">Demande: {r.message}</p>}
                  {r.response_note && <p className="text-sm text-sky-300 mt-1">Réponse: {r.response_note}</p>}
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
                const edit = examStatusEdit[r.id] || { statut: r.statut, response_note: r.response_note || '' };
                return (
                  <div key={r.id} className="rounded border border-slate-700/60 p-3 space-y-2">
                    <p className="text-slate-200 font-medium">{requester?.identifiant || r.requester_id} · {r.licence_code}</p>
                    {r.message && <p className="text-sm text-slate-400">Demande: {r.message}</p>}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        className="input"
                        value={edit.statut}
                        onChange={(ev) => setExamStatusEdit((prev) => ({ ...prev, [r.id]: { ...edit, statut: ev.target.value } }))}
                      >
                        <option value="assigne">Assigné</option>
                        <option value="accepte">Accepté</option>
                        <option value="termine">Terminé</option>
                        <option value="refuse">Refusé</option>
                      </select>
                      <input
                        className="input md:col-span-2"
                        value={edit.response_note}
                        onChange={(ev) => setExamStatusEdit((prev) => ({ ...prev, [r.id]: { ...edit, response_note: ev.target.value } }))}
                        placeholder="Réponse / note instructeur"
                      />
                    </div>
                    <button type="button" className="btn-primary" disabled={loading} onClick={() => updateExamRequest(r.id)}>
                      Mettre à jour
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
