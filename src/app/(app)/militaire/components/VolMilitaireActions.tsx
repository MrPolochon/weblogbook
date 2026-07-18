'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, FileText } from 'lucide-react';
import { AAR_TAGS, LIB_AAR_TAG } from '@/lib/armee';

type Props = {
  volId: string;
  canValidate: boolean;
  canSubmitAar: boolean;
  statut: string;
  hasMission: boolean;
  initialNotes?: string | null;
  initialTags?: string[] | null;
};

export default function VolMilitaireActions({
  volId,
  canValidate,
  canSubmitAar,
  statut,
  hasMission,
  initialNotes,
  initialTags,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes || '');
  const [tags, setTags] = useState<string[]>(initialTags || []);

  async function decide(statutNext: 'validé' | 'refusé') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/armee/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: statutNext,
          refusal_reason: statutNext === 'refusé' ? 'Refusé par le PDG militaire' : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function saveAar() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/armee/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aar: true,
          mission_aar_notes: notes,
          mission_aar_tags: tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 6)));
  }

  return (
    <div className="space-y-4">
      {canValidate && statut === 'en_attente' && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
          <p className="text-sm font-medium text-emerald-200">Validation PDG / ops</p>
          <p className="text-xs text-slate-400">
            En tant que PDG militaire (ou admin), vous validez ou refusez ce vol. Une validation de mission crédite le compte Felitz Armée.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('validé')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Valider
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('refusé')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm font-medium disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Refuser
            </button>
          </div>
        </div>
      )}

      {canSubmitAar && hasMission && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-400" />
            <p className="text-sm font-medium text-slate-200">Rapport après action (AAR)</p>
          </div>
          <textarea
            className="input w-full min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Compte-rendu court (objectif, incidents, météo…)"
            maxLength={2000}
          />
          <div className="flex flex-wrap gap-2">
            {AAR_TAGS.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                    active
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-200'
                      : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {LIB_AAR_TAG[tag] || tag}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveAar}
            className="px-4 py-2 rounded-lg bg-sky-600/90 hover:bg-sky-600 text-white text-sm font-medium disabled:opacity-50"
          >
            Enregistrer l&apos;AAR
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
