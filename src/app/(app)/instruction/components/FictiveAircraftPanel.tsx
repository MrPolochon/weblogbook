'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plane } from 'lucide-react';
import type { TypeAvion, AvionTemp } from '../types';

const LIFECYCLE_LABELS: Record<string, string> = {
  brouillon: 'En attente (session non démarrée)',
  actif: 'Visible pour l\'élève',
};

interface FictiveAircraftPanelProps {
  sessionKind: 'exam' | 'pilot_training';
  sessionId: string;
  sessionLabel: string;
  sessionStatut: string;
  typesAvion: TypeAvion[];
  avions: AvionTemp[];
  disabled?: boolean;
}

export default function FictiveAircraftPanel({
  sessionKind,
  sessionId,
  sessionLabel,
  sessionStatut,
  typesAvion,
  avions,
  disabled = false,
}: FictiveAircraftPanelProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [typeAvionId, setTypeAvionId] = useState('');
  const [nomPerso, setNomPerso] = useState('');
  const [immat, setImmat] = useState('');
  const [editById, setEditById] = useState<Record<string, { nom: string; immat: string; aeroport: string }>>({});

  const canManage = ['assigne', 'accepte', 'en_cours'].includes(sessionStatut);
  const sessionStarted = sessionStatut === 'en_cours';

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

  async function addAvion(e: React.FormEvent) {
    e.preventDefault();
    if (!typeAvionId) {
      toast.error('Choisissez un type d\'avion.');
      return;
    }
    await run(async () => {
      const res = await fetch('/api/instruction/avions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_kind: sessionKind,
          session_id: sessionId,
          type_avion_id: typeAvionId,
          nom_personnalise: nomPerso.trim() || null,
          immatriculation: immat.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur création avion fictif');
      setTypeAvionId('');
      setNomPerso('');
      setImmat('');
      toast.success(
        sessionStarted
          ? 'Avion fictif créé et visible pour l\'élève.'
          : 'Avion fictif préparé. Il apparaîtra dans l\'inventaire de l\'élève au démarrage de la session.',
      );
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
      toast.success('Avion fictif mis à jour.');
    });
  }

  async function removeAvion(id: string) {
    if (!confirm('Supprimer cet avion fictif ?')) return;
    await run(async () => {
      const res = await fetch(`/api/instruction/avions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur suppression avion');
      toast.success('Avion fictif supprimé.');
    });
  }

  if (!canManage && avions.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-lime-500/25 bg-lime-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Plane className="h-4 w-4 text-lime-400" />
        <p className="text-sm font-medium text-lime-200">Avion fictif — {sessionLabel}</p>
      </div>
      <p className="text-xs text-slate-500">
        Préparez un appareil temporaire pour cette session. L&apos;élève ne le verra dans son inventaire
        qu&apos;une fois la session <strong className="text-slate-400">démarrée</strong>.
      </p>

      {canManage && (
        <form onSubmit={addAvion} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            className="input"
            value={typeAvionId}
            onChange={(e) => setTypeAvionId(e.target.value)}
            required
            disabled={disabled || loading}
          >
            <option value="">Type d&apos;avion</option>
            {typesAvion.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}{t.code_oaci ? ` (${t.code_oaci})` : ''}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={immat}
            onChange={(e) => setImmat(e.target.value.toUpperCase())}
            placeholder="Immatriculation (optionnel)"
            disabled={disabled || loading}
          />
          <input
            className="input"
            value={nomPerso}
            onChange={(e) => setNomPerso(e.target.value)}
            placeholder="Nom personnalisé (optionnel)"
            disabled={disabled || loading}
          />
          <button className="btn-primary text-sm" type="submit" disabled={disabled || loading}>
            Créer l&apos;avion fictif
          </button>
        </form>
      )}

      {avions.length === 0 ? (
        <p className="text-xs text-slate-500">Aucun avion fictif pour cette session.</p>
      ) : (
        avions.map((a) => {
          const type = typesAvion.find((t) => t.id === a.type_avion_id);
          const edit = editById[a.id] || {
            nom: a.nom_personnalise || '',
            immat: a.immatriculation || '',
            aeroport: a.aeroport_actuel || 'IRFD',
          };
          const lifecycle = a.instruction_lifecycle || 'brouillon';
          return (
            <div key={a.id} className="rounded border border-slate-700/60 p-3 space-y-2 bg-slate-900/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-300">{type?.nom || 'Type inconnu'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  lifecycle === 'actif'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}>
                  {LIFECYCLE_LABELS[lifecycle] || lifecycle}
                </span>
              </div>
              {canManage ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    className="input"
                    value={edit.immat}
                    onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, immat: ev.target.value.toUpperCase() } }))}
                    placeholder="Immatriculation"
                    disabled={loading}
                  />
                  <input
                    className="input"
                    value={edit.nom}
                    onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, nom: ev.target.value } }))}
                    placeholder="Nom personnalisé"
                    disabled={loading}
                  />
                  <input
                    className="input"
                    value={edit.aeroport}
                    onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, aeroport: ev.target.value.toUpperCase() } }))}
                    placeholder="Aéroport actuel"
                    disabled={loading}
                  />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary text-xs" disabled={loading} onClick={() => saveAvion(a.id)}>
                      Enregistrer
                    </button>
                    <button type="button" className="btn-secondary text-xs" disabled={loading} onClick={() => removeAvion(a.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-mono">
                  {a.immatriculation || '—'} · {a.aeroport_actuel || 'IRFD'}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
