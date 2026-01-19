'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

export default function SeMettreEnServiceForm() {
  const router = useRouter();
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!aeroport || !position) { setError('Choisissez l\'aéroport et la position.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aeroport, position }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label className="label">Aéroport</label>
        <select className="input" value={aeroport} onChange={(e) => setAeroport(e.target.value)} required>
          <option value="">— Choisir —</option>
          {AEROPORTS_PTFS.map((a) => (
            <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Position</label>
        <select className="input" value={position} onChange={(e) => setPosition(e.target.value)} required>
          <option value="">— Choisir —</option>
          {ATC_POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Mise en service…' : 'Se mettre en service'}
      </button>
    </form>
  );
}
