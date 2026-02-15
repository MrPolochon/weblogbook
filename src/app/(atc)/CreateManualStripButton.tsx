'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Loader2, X } from 'lucide-react';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

interface Props {
  sessionAeroport: string;
}

export default function CreateManualStripButton({ sessionAeroport }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [callsign, setCallsign] = useState('');
  const [destination, setDestination] = useState('');
  const [typeVol, setTypeVol] = useState<'VFR' | 'IFR'>('VFR');

  function reset() {
    setCallsign('');
    setDestination('');
    setTypeVol('VFR');
    setError('');
  }

  function close() {
    if (loading) return;
    setOpen(false);
    reset();
  }

  async function handleCreate() {
    setError('');
    if (!callsign.trim()) { setError('Callsign requis'); return; }
    if (!destination.trim()) { setError('Destination requise'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/atc/creer-strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_vol: callsign.trim().toUpperCase(),
          aeroport_arrivee: destination.toUpperCase(),
          type_vol: typeVol,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <FilePlus className="h-4 w-4" />
        Créer un strip
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm relative">
            <button onClick={close} disabled={loading} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30">
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Créer un strip manuel</h3>
            <p className="text-sm text-slate-500 mb-4">
              Départ depuis <span className="font-mono font-bold text-emerald-600">{sessionAeroport}</span> — aucun pilote assigné
            </p>

            <div className="space-y-3">
              {/* Callsign */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Callsign</label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                  placeholder="AFR1234"
                  maxLength={10}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              {/* Destination */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Destination</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  <option value="">— Sélectionner —</option>
                  {AEROPORTS_PTFS.filter(a => a.code !== sessionAeroport).map((apt) => (
                    <option key={apt.code} value={apt.code}>
                      {apt.code} – {apt.nom}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type de vol */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Type de vol</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTypeVol('VFR')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                      typeVol === 'VFR'
                        ? 'bg-sky-100 text-sky-700 border-2 border-sky-400'
                        : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    VFR
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeVol('IFR')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                      typeVol === 'IFR'
                        ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                        : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    IFR
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCreate}
                disabled={loading || !callsign.trim() || !destination}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
                {loading ? 'Création…' : 'Créer le strip'}
              </button>
              <button
                onClick={close}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 rounded-lg text-sm font-bold transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
