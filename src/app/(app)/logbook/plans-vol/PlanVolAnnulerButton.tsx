'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

const STATUTS_ANNULABLES = ['depose', 'en_attente', 'refuse', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];

type Props = { planId: string; statut: string };

export default function PlanVolAnnulerButton({ planId, statut }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [mounted, setMounted] = useState(false);

  if (!STATUTS_ANNULABLES.includes(statut)) return null;

  const isEnVol = ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'].includes(statut);

  function openModal() {
    setMounted(true);
    setStep(1);
  }

  function closeModal() {
    setStep(0);
    setMounted(false);
  }

  async function doCancel() {
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      closeModal();
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const modal = mounted && step > 0 ? createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        {step === 1 && (
          <>
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Annuler ce vol ?</h3>
            <p className="text-sm text-slate-400 mb-2">Aucun revenu ne sera verse.</p>
            {isEnVol && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
                <p className="text-sm text-amber-300 font-medium">
                  Ce vol est actuellement en cours. Le controleur ATC sera notifie de l&apos;annulation.
                </p>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Oui, annuler le vol
              </button>
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
              >
                Non
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3 className="text-lg font-semibold text-red-400 mb-3">Confirmation finale</h3>
            <p className="text-sm text-slate-300 mb-5">
              Cette action est <span className="font-bold text-red-400">irreversible</span>. Le plan de vol sera definitivement annule.
            </p>
            <div className="flex gap-3">
              <button
                onClick={doCancel}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
              >
                {loading ? 'Annulation…' : 'Confirmer l\'annulation'}
              </button>
              <button
                onClick={closeModal}
                disabled={loading}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
              >
                Retour
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={loading}
        className="text-sm text-red-400 hover:underline disabled:opacity-50"
      >
        Annuler
      </button>
      {modal}
    </>
  );
}
