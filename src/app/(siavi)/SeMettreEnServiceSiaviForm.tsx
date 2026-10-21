'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

// Aéroports exclusivement SIAVI
const AEROPORTS_SIAVI_EXCLUSIFS = ['IBTH', 'IJAF', 'IBAR', 'IHEN', 'IDCS', 'ILKL', 'ISCM'];

export default function SeMettreEnServiceSiaviForm({ initialMode }: { initialMode?: 'pompier' | 'afis' }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport, setAeroport] = useState('');
  const [mode, setMode] = useState(initialMode ?? 'pompier');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Séparer les aéroports SIAVI exclusifs des autres
  const aeroportsSiavi = AEROPORTS_PTFS.filter(a => AEROPORTS_SIAVI_EXCLUSIFS.includes(a.code));
  const autresAeroports = AEROPORTS_PTFS.filter(a => !AEROPORTS_SIAVI_EXCLUSIFS.includes(a.code));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aeroport) {
      setError('Veuillez sélectionner un aéroport.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/siavi/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aeroport, mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la mise en service');
      }

      startTransition(() => { router.push(mode === 'afis' ? '/siavi/afis' : '/siavi/pompier'); router.refresh(); });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="siavi-service-airport" className="block text-sm font-semibold text-slate-200 mb-2">Sur quel aéroport prenez-vous votre service ?</label>
        <select
          id="siavi-service-airport"
          required
          value={aeroport}
          onChange={(e) => setAeroport(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">— Sélectionner un aéroport —</option>
          <optgroup label="🔥 Aéroports SIAVI (priorité AFIS)">
            {aeroportsSiavi.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} – {a.nom}
              </option>
            ))}
          </optgroup>
          <optgroup label="Autres aéroports (AFIS si pas d'ATC)">
            {autresAeroports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} – {a.nom}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {initialMode ? <p className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">Fonction choisie : <strong className="text-white">{initialMode==='afis'?'Pompier AFIS':'Pompier aéroportuaire'}</strong>. Pour changer, utilisez les onglets en haut.</p> : <label className="block text-sm text-slate-200">Votre fonction<select value={mode} onChange={e=>setMode(e.target.value as 'afis'|'pompier')} className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white"><option value="pompier">Pompier aéroportuaire</option><option value="afis">Pompier AFIS</option></select></label>}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-sm font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !aeroport}
        className={`min-h-12 w-full rounded-xl px-4 py-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode==='afis'?'bg-cyan-400 text-slate-950 hover:bg-cyan-300':'bg-amber-400 text-slate-950 hover:bg-amber-300'}`}
      >
        {loading ? 'Prise de service en cours…' : mode==='afis'?'Prendre mon service AFIS':'Prendre mon service pompier'}
      </button>

      <p className="text-xs text-amber-200 font-medium">
        Le mode Pompier reste disponible avec un ATC présent. Le mode AFIS est disponible sans ATC, ou sur les aéroports SIAVI exclusifs. Vous pourrez changer de fonction pendant votre service.
      </p>
    </form>
  );
}
