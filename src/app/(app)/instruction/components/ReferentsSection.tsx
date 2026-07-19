'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, UserCheck, UserMinus } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import type { Eleve } from '../types';

type ReferentRow = {
  eleve_id: string;
  instructeur_id: string;
  created_at: string;
  eleve: { identifiant: string; formation_instruction_licence: string | null } | null;
};

interface ReferentsSectionProps {
  eleves: Eleve[];
}

/** Gestion instructeur : élèves référents pour l'assignation training / examens. */
export default function ReferentsSection({ eleves }: ReferentsSectionProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [referents, setReferents] = useState<ReferentRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const referentIds = useMemo(() => new Set(referents.map((r) => r.eleve_id)), [referents]);

  const activeEleves = useMemo(
    () => eleves.filter((e) => e.formation_instruction_active),
    [eleves],
  );

  const addableEleves = useMemo(
    () => activeEleves.filter((e) => !referentIds.has(e.id)),
    [activeEleves, referentIds],
  );

  const loadReferents = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/instruction/referents');
      const data = (await res.json().catch(() => ({}))) as { referents?: ReferentRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur chargement');
      setReferents(data.referents ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferents();
  }, [loadReferents]);

  async function addReferent(eleveId: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/instruction/referents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleve_id: eleveId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Élève ajouté à vos référents d\'assignation.');
      await loadReferents();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function removeReferent(eleveId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/instruction/referents?eleve_id=${encodeURIComponent(eleveId)}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Référent retiré — les prochaines demandes suivront l\'assignation automatique.');
      await loadReferents();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4 border-l-4 border-l-amber-500/60">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Star className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Mes élèves référents</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Leurs demandes de training et d&apos;examen vous sont assignées en priorité (si vous êtes disponible et habilité).
          </p>
        </div>
      </div>

      {listLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : referents.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun élève référent pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {referents.map((r) => {
            const ident = r.eleve?.identifiant ?? r.eleve_id;
            const eleve = eleves.find((e) => e.id === r.eleve_id);
            return (
              <li
                key={r.eleve_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <UserAvatar
                    identifiant={ident}
                    photoUrl={eleve?.photoUrl}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{ident}</p>
                    {r.eleve?.formation_instruction_licence && (
                      <p className="text-xs text-slate-500">{r.eleve.formation_instruction_licence}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs flex items-center gap-1"
                  disabled={loading}
                  onClick={() => void removeReferent(r.eleve_id)}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Retirer
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {addableEleves.length > 0 && (
        <div className="pt-2 border-t border-slate-700/40 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Ajouter un élève</p>
          <div className="flex flex-wrap gap-2">
            {addableEleves.map((e) => (
              <button
                key={e.id}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-amber-500/30 bg-amber-500/5 text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
                disabled={loading}
                onClick={() => void addReferent(e.id)}
              >
                <UserCheck className="h-3.5 w-3.5" />
                {e.identifiant}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
