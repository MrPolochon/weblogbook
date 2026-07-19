'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, Trash2, UserCog } from 'lucide-react';

type AdminReferentRow = {
  eleve_id: string;
  instructeur_id: string;
  created_at: string;
  updated_at: string;
  eleve: { identifiant: string; formation_instruction_licence: string | null } | null;
  instructeur: { identifiant: string } | null;
};

type Candidate = { id: string; identifiant: string };

/** Admin : gestion globale des liens élève ↔ référent d'assignation. */
export default function AdminReferentsTab() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminReferentRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [pick, setPick] = useState<Record<string, string>>({});

  const loadRows = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/admin/instruction-referents');
      const data = (await res.json().catch(() => ({}))) as { referents?: AdminReferentRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setRows(data.referents ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function loadCandidates(eleveId: string) {
    try {
      const res = await fetch('/api/admin/instruction-referents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleve_id: eleveId }),
      });
      const data = (await res.json().catch(() => ({}))) as { candidates?: Candidate[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setCandidates((c) => ({ ...c, [eleveId]: data.candidates ?? [] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function reassign(eleveId: string) {
    const instructeurId = pick[eleveId];
    if (!instructeurId) {
      toast.error('Choisissez un instructeur.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/instruction-referents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleve_id: eleveId, instructeur_id: instructeurId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Référent réassigné.');
      await loadRows();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function remove(eleveId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/instruction-referents?eleve_id=${encodeURIComponent(eleveId)}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Lien référent supprimé.');
      await loadRows();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4 border-l-4 border-l-amber-500/60 min-w-0">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
          <Star className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-100">Référents d&apos;assignation</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Priorité automatique pour training et examens. Sans référent, retour à l&apos;assignation least-busy.
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Référents éligibles : FI (parcours vol) ou ATC FI (parcours ATC).
          </p>
        </div>
      </div>

      {listLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun lien élève ↔ référent enregistré.</p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-medium">Élève</th>
                <th className="px-3 py-2.5 font-medium">Parcours</th>
                <th className="px-3 py-2.5 font-medium">Référent actuel</th>
                <th className="px-3 py-2.5 font-medium">Réassigner</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {rows.map((r) => {
                const cands = candidates[r.eleve_id] ?? [];
                return (
                  <tr key={r.eleve_id} className="align-top hover:bg-slate-800/20">
                    <td className="px-3 py-3 text-slate-200 whitespace-nowrap">
                      {r.eleve?.identifiant ?? r.eleve_id}
                    </td>
                    <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
                      {r.eleve?.formation_instruction_licence ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-amber-200 whitespace-nowrap">
                      {r.instructeur?.identifiant ?? r.instructeur_id}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2 min-w-[14rem]">
                        <select
                          className="input text-xs min-w-[10rem] max-w-[14rem]"
                          value={pick[r.eleve_id] ?? ''}
                          onFocus={() => {
                            if (!candidates[r.eleve_id]) void loadCandidates(r.eleve_id);
                          }}
                          onChange={(ev) => setPick((p) => ({ ...p, [r.eleve_id]: ev.target.value }))}
                          disabled={loading}
                        >
                          <option value="">— Instructeur —</option>
                          {cands.map((c) => (
                            <option key={c.id} value={c.id}>{c.identifiant}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-secondary text-xs flex items-center gap-1"
                          disabled={loading || !pick[r.eleve_id]}
                          onClick={() => void reassign(r.eleve_id)}
                        >
                          <UserCog className="h-3.5 w-3.5" />
                          Appliquer
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="btn-secondary text-xs text-red-300 border-red-500/30 flex items-center gap-1"
                        disabled={loading}
                        onClick={() => void remove(r.eleve_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
