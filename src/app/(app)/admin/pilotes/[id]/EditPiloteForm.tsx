'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EditPiloteForm({
  piloteId,
  heuresInitiales,
  blockedUntil,
  blockReason,
}: {
  piloteId: string;
  heuresInitiales: number;
  blockedUntil: string | null;
  blockReason: string | null;
}) {
  const router = useRouter();
  const [heures, setHeures] = useState(String(heuresInitiales));
  const [blockMinutes, setBlockMinutes] = useState('');
  const [blockReasonVal, setBlockReasonVal] = useState(blockReason ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBlocked = blockedUntil ? new Date(blockedUntil) > new Date() : false;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const h = parseInt(heures, 10);
      if (isNaN(h) || h < 0) throw new Error('Heures initiales invalides');

      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heures_initiales_minutes: h }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const m = parseInt(blockMinutes, 10);
    if (isNaN(m) || m < 1) {
      setError('Indiquez une durée en minutes (≥ 1).');
      return;
    }
    setLoading(true);
    try {
      const d = new Date();
      d.setMinutes(d.getMinutes() + m);
      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocked_until: d.toISOString(),
          block_reason: blockReasonVal || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBlockMinutes('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnblock() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked_until: null, block_reason: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBlockReasonVal('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-6">
      <form onSubmit={handleSave} className="space-y-4">
        <h2 className="text-lg font-medium text-slate-200">Heures initiales</h2>
        <div>
          <label className="label">Minutes</label>
          <input
            type="number"
            className="input w-32"
            value={heures}
            onChange={(e) => setHeures(e.target.value)}
            min={0}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <hr className="border-slate-700" />

      <div>
        <h2 className="text-lg font-medium text-slate-200 mb-2">Blocage</h2>
        {isBlocked ? (
          <div>
            <p className="text-amber-400 text-sm mb-2">Ce pilote est bloqué.</p>
            <div>
              <label className="label">Raison (optionnel)</label>
              <input
                type="text"
                className="input max-w-md"
                value={blockReasonVal}
                onChange={(e) => setBlockReasonVal(e.target.value)}
                placeholder="Raison du blocage"
              />
            </div>
            <button
              type="button"
              onClick={handleUnblock}
              className="btn-secondary mt-3"
              disabled={loading}
            >
              Débloquer maintenant
            </button>
          </div>
        ) : (
          <form onSubmit={handleBlock} className="space-y-2">
            <label className="label">Bloquer pour (minutes)</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input w-32"
                value={blockMinutes}
                onChange={(e) => setBlockMinutes(e.target.value)}
                min={1}
                placeholder="ex: 60"
              />
              <input
                type="text"
                className="input flex-1"
                value={blockReasonVal}
                onChange={(e) => setBlockReasonVal(e.target.value)}
                placeholder="Raison (optionnel)"
              />
              <button type="submit" className="btn-secondary" disabled={loading}>
                Bloquer
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
