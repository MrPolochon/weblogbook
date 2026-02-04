'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

// Aéroports exclusivement SIAVI
const AEROPORTS_SIAVI_EXCLUSIFS = ['IBTH', 'IJAF', 'IBAR', 'IHEN', 'IDCS', 'ILKL', 'ISCM'];

export default function SeMettreEnServiceSiaviForm() {
  const router = useRouter();
  const [aeroport, setAeroport] = useState('');
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
        body: JSON.stringify({ aeroport }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la mise en service');
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-amber-800 mb-1">Aéroport</label>
        <select
          value={aeroport}
          onChange={(e) => setAeroport(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
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

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-sm font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !aeroport}
        className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white font-bold transition-colors"
      >
        {loading ? 'Connexion...' : 'Se mettre en service'}
      </button>

      <p className="text-xs text-amber-700 font-medium">
        Sur les aéroports SIAVI exclusifs, vous aurez automatiquement les fonctions AFIS.
        Sur les autres aéroports, vous serez AFIS uniquement si aucun ATC n&apos;est en ligne.
      </p>
    </form>
  );
}
