'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { InstructionProgram } from '@/lib/instruction-programs';
import { isAtcInstructionProgram } from '@/lib/instruction-programs';
import { UserPlus, Users } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import type { Eleve } from '../types';
import ReferentsSection from './ReferentsSection';

function progressionToggleKey(eleveId: string, licenceCode: string, moduleCode: string) {
  return `${eleveId}::${licenceCode}::${moduleCode}`;
}

interface FormationTabProps {
  formationProgramsForCreate: InstructionProgram[];
  programs: InstructionProgram[];
  isManager: boolean;
  eleves: Eleve[];
  elevesProgression: Array<{ eleve_id: string; licence_code: string; module_code: string; completed: boolean; note?: string | null }>;
}

export default function FormationTab({
  formationProgramsForCreate,
  programs,
  isManager,
  eleves,
  elevesProgression,
}: FormationTabProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const [addEleveIdentifiant, setAddEleveIdentifiant] = useState('');
  const [formationLicence, setFormationLicence] = useState(
    () => formationProgramsForCreate[0]?.licenceCode ?? 'ATC-INIT',
  );
  const [progressionOverrides, setProgressionOverrides] = useState<Record<string, boolean>>({});
  const [savingProgKeys, setSavingProgKeys] = useState<Set<string>>(() => new Set());
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingNoteKeys, setSavingNoteKeys] = useState<Set<string>>(() => new Set());
  const [transferCandidatesByEleve, setTransferCandidatesByEleve] = useState<
    Record<string, Array<{ id: string; identifiant: string }>>
  >({});
  const [transferPickByEleve, setTransferPickByEleve] = useState<Record<string, string>>({});
  const [transferListLoading, setTransferListLoading] = useState<Record<string, boolean>>({});
  const [transferLoadedByEleve, setTransferLoadedByEleve] = useState<Record<string, boolean>>({});

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

  const loadTransferCandidates = useCallback(
    async (eleveId: string, opts?: { silent?: boolean }) => {
      setTransferListLoading((L) => (L[eleveId] ? L : { ...L, [eleveId]: true }));
      try {
        const res = await fetch(`/api/instruction/eleves/${encodeURIComponent(eleveId)}/transfer-candidates`);
        const data = (await res.json().catch(() => ({}))) as {
          candidates?: Array<{ id: string; identifiant: string }>;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Liste instructeurs');
        setTransferCandidatesByEleve((prev) => ({ ...prev, [eleveId]: data.candidates ?? [] }));
        setTransferLoadedByEleve((prev) => ({ ...prev, [eleveId]: true }));
      } catch (e) {
        if (!opts?.silent) toast.error(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setTransferListLoading((L) => {
          if (!L[eleveId]) return L;
          const next = { ...L };
          delete next[eleveId];
          return next;
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!isManager) return;
    const activeIds = eleves
      .filter((e) => e.formation_instruction_active)
      .map((e) => e.id);
    for (const id of activeIds) {
      if (transferLoadedByEleve[id] || transferListLoading[id]) continue;
      void loadTransferCandidates(id, { silent: true });
    }
    setTransferLoadedByEleve((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of activeIds) if (prev[id]) next[id] = true;
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleves, isManager, loadTransferCandidates]);

  const progressionNotesServer = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of elevesProgression) {
      const k = `${row.eleve_id}::${row.licence_code}::${row.module_code}`;
      m.set(k, row.note?.trim() ?? '');
    }
    return m;
  }, [elevesProgression]);

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

  async function addEleveToFormation(e: React.FormEvent) {
    e.preventDefault();
    const ident = addEleveIdentifiant.trim().toLowerCase();
    if (ident.length < 2) {
      toast.error('Indiquez un identifiant valide.');
      return;
    }
    await run(async () => {
      const res = await fetch('/api/instruction/eleves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existing_identifiant: ident,
          formation_instruction_licence: formationLicence,
          set_assignment_referent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur ajout élève');
      setAddEleveIdentifiant('');
      toast.success('Élève rattaché à votre formation et ajouté à vos référents d\'assignation.');
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
      toast.success(
        'Formation terminée : dossier PDF enregistré dans « DOSSIER FORMATION » (accès administrateur) et avions temporaires retirés.',
      );
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

  async function transferEleve(eleveId: string, nouvelInstructeurId: string) {
    if (!nouvelInstructeurId) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/eleves/${encodeURIComponent(eleveId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer_instructeur', nouvel_instructeur_id: nouvelInstructeurId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur transfert');
      setTransferPickByEleve((p) => ({ ...p, [eleveId]: '' }));
      toast.success('Élève transféré : la progression et les notes sont conservées.');
    });
  }

  async function flushProgressionNote(
    eleveId: string,
    licenceCode: string,
    moduleCode: string,
    completedForRow: boolean,
    draftVal: string,
  ) {
    const key = progressionToggleKey(eleveId, licenceCode, moduleCode);
    const baseline = progressionNotesServer.get(key) ?? '';
    if (draftVal === baseline) {
      setNotesDraft((nd) => {
        if (!Object.prototype.hasOwnProperty.call(nd, key)) return nd;
        const next = { ...nd };
        delete next[key];
        return next;
      });
      return;
    }
    setSavingNoteKeys((s) => new Set(s).add(key));
    try {
      const res = await fetch('/api/instruction/progression', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eleve_id: eleveId,
          licence_code: licenceCode,
          module_code: moduleCode,
          completed: completedForRow,
          note: draftVal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur enregistrement note');
      setNotesDraft((nd) => {
        const next = { ...nd };
        delete next[key];
        return next;
      });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingNoteKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
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

  return (
    <>
      {formationProgramsForCreate.length > 0 && (
        <form onSubmit={addEleveToFormation} className="card space-y-4 border-l-4 border-l-sky-500/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10"><UserPlus className="h-5 w-5 text-sky-400" /></div>
            <h2 className="text-lg font-semibold text-slate-100">Ajouter un élève à ma formation</h2>
          </div>
          <p className="text-sm text-slate-500">
            Rattache un compte <strong className="text-slate-400">existant</strong> par identifiant (aucun compte fictif).
            L&apos;élève devient aussi votre référent d&apos;assignation pour les demandes de training et d&apos;examen.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="min-w-0 space-y-1 text-sm text-slate-400">
              <span className="text-slate-500">Identifiant du compte</span>
              <input
                className="input w-full"
                value={addEleveIdentifiant}
                onChange={(e) => setAddEleveIdentifiant(e.target.value)}
                placeholder="ex. jean.dupont"
                required
                minLength={2}
                autoComplete="off"
              />
            </label>
            <label className="min-w-0 space-y-1 text-sm text-slate-400">
              <span className="text-slate-500">Parcours</span>
              <select
                className="input w-full"
                value={formationLicence}
                onChange={(e) => setFormationLicence(e.target.value)}
              >
                {formationProgramsForCreate.map((p) => (
                  <option key={p.licenceCode} value={p.licenceCode}>{p.label}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                Ajouter l&apos;élève
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Comptes non éligibles : administrateur, déjà en formation active chez un autre instructeur, ou déjà parmi vos élèves actifs.
          </p>
        </form>
      )}

      {eleves.some((e) => e.formation_instruction_active) && <ReferentsSection eleves={eleves} />}

      <div className="card space-y-4 border-l-4 border-l-orange-500/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><Users className="h-5 w-5 text-orange-400" /></div>
          <h2 className="text-lg font-semibold text-slate-100">Élèves en formation</h2>
          {eleves.length > 0 && (
            <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-300 font-medium">{eleves.length}</span>
          )}
        </div>
        {eleves.length === 0 && <p className="text-slate-500">Aucun élève rattaché.</p>}
        {eleves.map((e) => {
          const licenceCode = e.formation_instruction_licence || 'PPL';
          const program = programs.find((p) => p.licenceCode === licenceCode) || null;
          const key = `${e.id}::${licenceCode}`;
          const completedSet = progressionByEleve.get(key) || new Set<string>();
          const progressPct = program && program.modules.length > 0
            ? Math.round((completedSet.size / program.modules.length) * 100)
            : 0;
          return (
            <div key={e.id} className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-5 space-y-4 transition-colors hover:border-slate-600/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar identifiant={e.identifiant} photoUrl={e.photoUrl} size="lg" className="ring-2 ring-orange-500/30" />
                  <div>
                    <p className="text-slate-100 font-semibold">{e.identifiant}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.formation_instruction_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}>
                        {e.formation_instruction_active ? 'Active' : 'Terminée'}
                      </span>
                      {program && <span className="text-xs text-slate-500">{program.label} — {progressPct}%</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
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
                  {e.formation_instruction_active && (() => {
                    const cands = transferCandidatesByEleve[e.id] ?? [];
                    const isLoading = Boolean(transferListLoading[e.id]);
                    const isLoaded = Boolean(transferLoadedByEleve[e.id]);
                    const noCandidates = isLoaded && cands.length === 0;
                    const pick = (transferPickByEleve[e.id] ?? '').trim();
                    const isAtcInit = isAtcInstructionProgram(e.formation_instruction_licence || '');
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col">
                          <select
                            className="input min-w-[11rem]"
                            value={transferPickByEleve[e.id] ?? ''}
                            onFocus={() => {
                              if (!isLoaded && !isLoading) void loadTransferCandidates(e.id);
                            }}
                            onChange={(ev) =>
                              setTransferPickByEleve((p) => ({ ...p, [e.id]: ev.target.value }))
                            }
                            disabled={loading || isLoading || noCandidates}
                          >
                            <option value="">
                              {isLoading
                                ? 'Chargement…'
                                : noCandidates
                                  ? 'Aucun autre instructeur éligible'
                                  : '— Transférer vers —'}
                            </option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>{c.identifiant}</option>
                            ))}
                          </select>
                          {noCandidates && (
                            <span className="text-[11px] text-amber-400 mt-1 max-w-[15rem] leading-tight">
                              Vous êtes le seul {isAtcInit ? 'ATC FI' : 'FI / instructeur'} disponible. Un autre référent doit être créé pour permettre le transfert.
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={loading || !pick || isLoading || noCandidates}
                          title={
                            noCandidates
                              ? 'Aucun autre instructeur éligible pour ce parcours.'
                              : !pick
                                ? 'Choisissez un instructeur dans la liste.'
                                : undefined
                          }
                          onClick={() => transferEleve(e.id, pick)}
                        >
                          Transférer
                        </button>
                        <button className="btn-secondary" type="button" disabled={loading} onClick={() => finishFormation(e.id)}>
                          Terminer la formation
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {program && (
                <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-200">Progression {program.label}</p>
                    <span className="text-sm font-bold text-emerald-400">{progressPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="text-xs text-slate-500">Saisissez une note par module ; elle est enregistrée à la sortie du champ.</p>
                  {program.modules.map((m) => {
                    const checked = completedSet.has(m.code);
                    const nk = progressionToggleKey(e.id, licenceCode, m.code);
                    const noteVal = Object.prototype.hasOwnProperty.call(notesDraft, nk)
                      ? (notesDraft[nk] ?? '')
                      : progressionNotesServer.get(nk) ?? '';
                    return (
                      <div key={m.code} className="space-y-1 rounded border border-slate-700/40 p-2 bg-slate-900/20">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(ev) => toggleProgression(e.id, licenceCode, m.code, ev.target.checked)}
                            disabled={loading || savingProgKeys.has(progressionToggleKey(e.id, licenceCode, m.code))}
                          />
                          <span className="text-sm text-slate-300">{m.code} — {m.title}</span>
                        </label>
                        <textarea
                          className="input text-sm min-h-[4rem] w-full resize-y max-w-full"
                          placeholder="Note instructeur (optionnel)"
                          rows={3}
                          value={noteVal}
                          onChange={(ev) =>
                            setNotesDraft((nd) => ({ ...nd, [nk]: ev.target.value }))
                          }
                          onBlur={(ev) =>
                            void flushProgressionNote(e.id, licenceCode, m.code, checked, ev.target.value)
                          }
                          disabled={loading || savingNoteKeys.has(nk)}
                        />
                        {savingNoteKeys.has(nk) ? (
                          <p className="text-xs text-slate-500">Enregistrement…</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </>
  );
}
