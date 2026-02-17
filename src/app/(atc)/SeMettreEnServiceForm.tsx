'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { MapPin, Radio, Loader2 } from 'lucide-react';

export default function SeMettreEnServiceForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!aeroport || !position) { setError('Sélectionnez l\'aéroport et la position.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aeroport, position }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            Aéroport
          </label>
          <select 
            className="input w-full font-mono" 
            value={aeroport} 
            onChange={(e) => setAeroport(e.target.value)} 
            required
          >
            <option value="">— Sélectionner —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600" />
            Position
          </label>
          <select 
            className="input w-full" 
            value={position} 
            onChange={(e) => setPosition(e.target.value)} 
            required
          >
            <option value="">— Sélectionner —</option>
            {ATC_POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
      
      <button 
        type="submit" 
        className="btn-primary flex items-center justify-center gap-2" 
        disabled={loading || !aeroport || !position}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Mise en service...
          </>
        ) : (
          <>
            <Radio className="h-4 w-4" />
            Se mettre en service
          </>
        )}
      </button>
    </form>
  );
}
