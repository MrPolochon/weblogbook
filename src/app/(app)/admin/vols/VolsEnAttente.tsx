'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDuree } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, X, Trash2 } from 'lucide-react';

type Vol = {
  id: string;
  duree_minutes: number;
  depart_utc: string;
  compagnie_libelle: string;
  type_vol: string;
  role_pilote: string;
  refusal_reason: string | null;
  pilote?: { identifiant?: string } | { identifiant?: string }[] | null;
  type_avion?: { nom?: string } | { nom?: string }[] | null;
};

export default function VolsEnAttente({ vols }: { vols: Vol[] }) {
  const router = useRouter();
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
      router.refresh();
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
      router.refresh();
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
      router.refresh();
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
                <p><span className="text-slate-500">Date:</span> {format(new Date(v.depart_utc), 'dd MMM yyyy HH:mm', { locale: fr })} UTC</p>
                <p><span className="text-slate-500">Appareil:</span> {(Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion)?.nom ?? '—'}</p>
                <p><span className="text-slate-500">Compagnie:</span> {v.compagnie_libelle}</p>
                <p><span className="text-slate-500">Durée:</span> {formatDuree(v.duree_minutes)} — {v.type_vol} — {v.role_pilote}</p>
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
