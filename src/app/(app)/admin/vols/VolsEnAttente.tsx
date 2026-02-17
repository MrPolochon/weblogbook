'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDuree } from '@/lib/utils';
import { Check, X, Trash2 } from 'lucide-react';

type Vol = {
  id: string;
  duree_minutes: number;
  depart_utc: string;
  arrivee_utc?: string | null;
  compagnie_libelle: string;
  type_vol: string;
  role_pilote: string;
  callsign?: string | null;
  refusal_reason: string | null;
  instruction_type?: string | null;
  type_avion_militaire?: string | null;
  mission_titre?: string | null;
  mission_reward_base?: number | null;
  mission_reward_final?: number | null;
  mission_delay_minutes?: number | null;
  mission_refusals?: number | null;
  mission_status?: string | null;
  aeroport_depart?: string | null;
  aeroport_arrivee?: string | null;
  commandant_bord?: string | null;
  escadrille_ou_escadron?: string | null;
  nature_vol_militaire?: string | null;
  nature_vol_militaire_autre?: string | null;
  pilote?: { identifiant?: string } | { identifiant?: string }[] | null;
  type_avion?: { nom?: string } | { nom?: string }[] | null;
  instructeur?: { identifiant?: string } | { identifiant?: string }[] | null;
  copilote?: { identifiant?: string } | { identifiant?: string }[] | null;
};

export default function VolsEnAttente({ vols }: { vols: Vol[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [refusalReason, setRefusalReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/vols/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'validé' }),
      });
      if (!res.ok) throw new Error('Erreur');
      startTransition(() => router.refresh());
    } finally {
      setLoading(null);
    }
  }

  async function handleRefuse(id: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/vols/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'refusé', refusal_reason: refusalReason[id] || null }),
      });
      if (!res.ok) throw new Error('Erreur');
      setRefusalReason((s) => ({ ...s, [id]: '' }));
      startTransition(() => router.refresh());
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce vol ?')) return;
    setLoading(id);
    try {
      const res = await fetch(`/api/vols/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      startTransition(() => router.refresh());
    } finally {
      setLoading(null);
    }
  }

  if (vols.length === 0) return <p className="text-slate-500">Aucun vol en attente.</p>;

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-medium text-slate-200">À valider</h2>
      <div className="space-y-3">
        {vols.map((v) => (
          <div key={v.id} className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="text-sm text-slate-300 space-y-1">
                <p><span className="text-slate-500">Pilote:</span> {(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—'}</p>
                <p><span className="text-slate-500">Date et heure départ (UTC):</span> {new Date(v.depart_utc).toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
                {(v.aeroport_depart || v.aeroport_arrivee) && (
                  <p><span className="text-slate-500">Trajet:</span> {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}</p>
                )}
                {v.arrivee_utc && (
                  <p><span className="text-slate-500">Heure arrivée (UTC):</span> {new Date(v.arrivee_utc).toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
                )}
                <p><span className="text-slate-500">Appareil:</span> {v.type_vol === 'Vol militaire' ? (v.type_avion_militaire || '—') : ((Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion)?.nom ?? '—')}</p>
                <p><span className="text-slate-500">Compagnie:</span> {v.compagnie_libelle}</p>
                <p><span className="text-slate-500">Durée:</span> {formatDuree(v.duree_minutes)} — {v.type_vol} — {v.role_pilote}{v.callsign ? ` — Callsign: ${v.callsign}` : ''}</p>
                {v.commandant_bord && (
                  <p><span className="text-slate-500">Commandant de bord:</span> {v.commandant_bord}</p>
                )}
                {(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant && (
                  <p><span className="text-slate-500">Co-pilote:</span> {(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant}</p>
                )}
                {v.type_vol === 'Instruction' && (
                  <p><span className="text-slate-500">Instruction:</span> par {(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? '—'} — {v.instruction_type || '—'}</p>
                )}
                {v.type_vol === 'Vol militaire' && (v.escadrille_ou_escadron || v.nature_vol_militaire || v.nature_vol_militaire_autre) && (
                  <p><span className="text-slate-500">Vol militaire:</span> {[v.escadrille_ou_escadron, v.nature_vol_militaire === 'autre' ? v.nature_vol_militaire_autre : v.nature_vol_militaire].filter(Boolean).join(' — ') || '—'}</p>
                )}
                {v.type_vol === 'Vol militaire' && v.mission_titre && (
                  <p>
                    <span className="text-slate-500">Mission:</span> {v.mission_titre}
                    {v.mission_reward_base ? ` — base ${v.mission_reward_base.toLocaleString('fr-FR')} F$` : ''}
                    {v.mission_refusals != null ? ` — refus ${v.mission_refusals}/3` : ''}
                    {v.mission_status ? ` — ${v.mission_status}` : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  className="input w-48 text-sm"
                  placeholder="Raison du refus (optionnel)"
                  value={refusalReason[v.id] ?? ''}
                  onChange={(e) => setRefusalReason((s) => ({ ...s, [v.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(v.id)}
                    disabled={loading === v.id}
                    className="btn-primary text-xs py-1.5 px-2 inline-flex gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Accepter
                  </button>
                  <button
                    onClick={() => handleRefuse(v.id)}
                    disabled={loading === v.id}
                    className="btn-danger text-xs py-1.5 px-2 inline-flex gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Refuser
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    disabled={loading === v.id}
                    className="btn-secondary text-xs py-1.5 px-2 inline-flex gap-1"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
