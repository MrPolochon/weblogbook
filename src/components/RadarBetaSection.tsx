'use client';

import { useState, useEffect } from 'react';

interface Props {
  variant?: 'default' | 'atc' | 'siavi';
}

export default function RadarBetaSection({ variant = 'default' }: Props) {
  const isSiavi = variant === 'siavi';
  const isAtc = variant === 'atc';
  const isAtcOrSiavi = isAtc || isSiavi;

  const [radarBeta, setRadarBeta] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [tokens, setTokens] = useState<{ id: string; label: string; created_at: string; last_used_at: string | null }[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => {
    fetch('/api/radar/beta-request')
      .then(r => r.json())
      .then(data => {
        setRadarBeta(data.radar_beta ?? false);
        setRequestStatus(data.request?.status ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (radarBeta) {
      fetch('/api/radar/token')
        .then(r => r.json())
        .then(data => setTokens(data.tokens ?? []))
        .catch(() => {});
    }
  }, [radarBeta]);

  async function requestAccess() {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/radar/beta-request', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setRequestStatus('pending');
      setMessage({ type: 'ok', text: 'Demande envoyée ! Un administrateur examinera votre demande.' });
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    }
    setSubmitting(false);
  }

  async function generateToken() {
    setGeneratingToken(true);
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

  const cardClass = isSiavi ? 'rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm' : isAtc ? 'card' : 'card';
  const titleClass = isSiavi ? 'text-red-800' : isAtcOrSiavi ? 'text-slate-800' : 'text-slate-100';
  const textClass = isSiavi ? 'text-slate-700' : isAtcOrSiavi ? 'text-slate-600' : 'text-slate-400';
  const btnClass = isSiavi
    ? 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50'
    : 'btn-primary';

  return (
    <div className={cardClass}>
      <h2 className={`text-lg font-bold mb-3 ${titleClass}`}>Radar ATC — BETA</h2>

      {radarBeta ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className={`text-sm font-medium ${isSiavi ? 'text-emerald-700' : 'text-emerald-400'}`}>
              Accès radar actif
            </span>
          </div>

          <div>
            <h3 className={`text-sm font-semibold mb-2 ${titleClass}`}>Tokens API (outil de capture)</h3>
            <p className={`text-xs mb-2 ${textClass}`}>
              Générez un token pour authentifier l&apos;outil de capture écran.
            </p>

            {newToken && (
              <div className="bg-emerald-900/20 border border-emerald-600/30 rounded p-3 mb-3">
                <p className="text-emerald-400 text-xs font-bold mb-1">Copiez ce token maintenant :</p>
                <code className="text-emerald-300 text-xs break-all select-all">{newToken}</code>
                <p className="text-emerald-500/60 text-xs mt-1">Ce token ne sera plus affiché.</p>
                <button className="text-xs text-emerald-400 mt-1 underline" onClick={() => setNewToken(null)}>Fermer</button>
              </div>
            )}

            {tokens.map(t => (
              <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0 text-xs">
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

            <button
              className={`mt-2 text-xs ${btnClass}`}
              onClick={generateToken}
              disabled={generatingToken || tokens.length >= 3}
            >
              {generatingToken ? 'Génération...' : 'Générer un token'}
            </button>
            {tokens.length >= 3 && (
              <p className={`text-xs mt-1 ${textClass}`}>Maximum 3 tokens. Supprimez-en un avant d&apos;en créer un nouveau.</p>
            )}
          </div>
        </div>
      ) : requestStatus === 'pending' ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
            <span className={`text-sm font-medium ${isSiavi ? 'text-yellow-700' : 'text-yellow-400'}`}>
              Demande en cours d&apos;examen
            </span>
          </div>
          <p className={`text-xs ${textClass}`}>
            Un administrateur examinera votre demande prochainement.
          </p>
        </div>
      ) : (
        <div>
          <p className={`text-sm mb-3 ${textClass}`}>
            Le radar ATC est en version beta. Demandez l&apos;accès pour tester cette fonctionnalité.
          </p>
          {message && (
            <p className={message.type === 'ok' ? 'text-emerald-400 text-sm mb-2' : 'text-red-400 text-sm mb-2'}>
              {message.text}
            </p>
          )}
          <button className={btnClass} onClick={requestAccess} disabled={submitting}>
            {submitting ? 'Envoi...' : 'Demander l\'accès au radar BETA'}
          </button>
        </div>
      )}
    </div>
  );
}
