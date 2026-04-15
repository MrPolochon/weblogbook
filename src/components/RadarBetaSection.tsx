'use client';

import { useState, useEffect } from 'react';

interface Props {
  variant?: 'default' | 'atc' | 'siavi';
}

export default function RadarBetaSection({ variant = 'default' }: Props) {
  const isSiavi = variant === 'siavi';
  const isAtc = variant === 'atc';

  const [tokens, setTokens] = useState<{ id: string; label: string; created_at: string; last_used_at: string | null }[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/radar/token')
      .then(r => r.json())
      .then(data => setTokens(data.tokens ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function generateToken() {
    setGeneratingToken(true);
    setMessage(null);
    try {
      const res = await fetch('/api/radar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Radar Capture' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setNewToken(data.token);
      const tRes = await fetch('/api/radar/token');
      const tData = await tRes.json();
      setTokens(tData.tokens ?? []);
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    }
    setGeneratingToken(false);
  }

  async function deleteToken(id: string) {
    try {
      await fetch(`/api/radar/token?id=${id}`, { method: 'DELETE' });
      setTokens(prev => prev.filter(t => t.id !== id));
    } catch { /* ignore */ }
  }

  if (loading) return null;

  const cardClass = isSiavi ? 'rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm' : 'card';
  const titleClass = isSiavi ? 'text-red-800' : isAtc ? 'text-slate-800' : 'text-slate-100';
  const textClass = isSiavi ? 'text-slate-700' : isAtc ? 'text-slate-600' : 'text-slate-400';
  const btnClass = isSiavi
    ? 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50'
    : 'btn-primary';

  return (
    <div className={cardClass}>
      <h2 className={`text-lg font-bold mb-1 ${titleClass}`}>Radar ATC</h2>
      <p className={`text-xs mb-4 ${textClass}`}>
        Générez un token pour authentifier l&apos;outil de capture RadarCapture.
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className={`text-sm font-medium ${isSiavi ? 'text-emerald-700' : 'text-emerald-400'}`}>
            Accès radar actif
          </span>
        </div>

        {newToken && (
          <div className={isSiavi ? 'bg-emerald-50 border border-emerald-300 rounded p-3' : 'bg-emerald-900/20 border border-emerald-600/30 rounded p-3'}>
            <p className={isSiavi ? 'text-emerald-700 text-xs font-bold mb-1' : 'text-emerald-400 text-xs font-bold mb-1'}>Copiez ce token maintenant :</p>
            <code className={`text-xs break-all select-all ${isSiavi ? 'text-emerald-800' : 'text-emerald-300'}`}>{newToken}</code>
            <p className={`text-xs mt-1 ${isSiavi ? 'text-emerald-500' : 'text-emerald-500/60'}`}>Ce token ne sera plus affiché.</p>
            <button className={`text-xs mt-1 underline ${isSiavi ? 'text-emerald-600' : 'text-emerald-400'}`} onClick={() => setNewToken(null)}>Fermer</button>
          </div>
        )}

        {tokens.map(t => (
          <div key={t.id} className={`flex items-center justify-between py-1.5 border-b last:border-0 text-xs ${isSiavi ? 'border-slate-200' : 'border-slate-700/30'}`}>
            <div>
              <span className={isSiavi ? 'text-slate-700' : 'text-slate-300'}>{t.label}</span>
              <span className={`ml-2 ${textClass}`}>
                {t.last_used_at ? `Utilisé ${new Date(t.last_used_at).toLocaleDateString('fr-FR')}` : 'Jamais utilisé'}
              </span>
            </div>
            <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => deleteToken(t.id)}>
              Supprimer
            </button>
          </div>
        ))}

        {message && (
          <p className={message.type === 'ok' ? 'text-emerald-400 text-sm' : 'text-red-400 text-sm'}>
            {message.text}
          </p>
        )}

        <button
          className={`text-xs ${btnClass}`}
          onClick={generateToken}
          disabled={generatingToken || tokens.length >= 3}
        >
          {generatingToken ? 'Génération...' : 'Générer un token'}
        </button>
        {tokens.length >= 3 && (
          <p className={`text-xs ${textClass}`}>Maximum 3 tokens. Supprimez-en un avant d&apos;en créer un nouveau.</p>
        )}

        <a
          href="/downloads/RadarCapture.exe"
          className={`inline-flex items-center gap-2 text-xs font-medium mt-2 ${isSiavi ? 'text-red-600 hover:text-red-700' : 'text-sky-400 hover:text-sky-300'} transition-colors`}
        >
          ⬇ Télécharger RadarCapture.exe
        </a>
      </div>
    </div>
  );
}
