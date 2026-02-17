'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, X, Plane } from 'lucide-react';

const STATUTS_OUVERTS = ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];

type Props = { planId: string; statut: string };

export default function PlanVolCloturerButton({ planId, statut }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [clotureDirecte, setClotureDirecte] = useState(false);

  const peutCloturer = STATUTS_OUVERTS.includes(statut);
  const enAttenteConfirmation = statut === 'en_attente_cloture';

  if (enAttenteConfirmation) {
    return <span className="text-amber-400 text-sm">En attente de confirmation ATC</span>;
  }
  if (!peutCloturer) return null;

  async function handleCloture() {
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cloture' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      
      // Vérifier si clôture directe ou en attente
      if (d.statut === 'cloture') {
        setClotureDirecte(true);
        setShowSuccessModal(true);
      } else {
        // En attente de confirmation ATC
        startTransition(() => router.refresh());
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
      setLoading(false);
    }
  }

  function handleCloseModal() {
    setShowSuccessModal(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button type="button" onClick={handleCloture} disabled={loading} className="text-sm text-sky-400 hover:underline disabled:opacity-50">
        {loading ? '…' : 'Clôturer le vol'}
      </button>

      {/* Modal de succès */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-emerald-500/20">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  Vol clôturé avec succès !
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  {clotureDirecte 
                    ? 'Votre vol a été clôturé. Voulez-vous l\'enregistrer dans votre logbook ?'
                    : 'La demande de clôture a été envoyée à l\'ATC.'}
                </p>
                
                {clotureDirecte && (
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/logbook/nouveau?plan=${planId}`}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                      <Plane className="h-4 w-4" />
                      Enregistrer dans le logbook
                    </Link>
                    <button
                      onClick={handleCloseModal}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors"
                    >
                      Plus tard
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
