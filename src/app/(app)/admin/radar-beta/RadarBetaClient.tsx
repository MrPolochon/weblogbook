'use client';

import { useState, useEffect } from 'react';

interface BetaRequest {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reason: string | null;
  profiles: { identifiant: string; role: string } | null;
}

export default function RadarBetaClient() {
  const [requests, setRequests] = useState<BetaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [superadminPwd, setSuperadminPwd] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function fetchRequests() {
    try {
      const res = await fetch('/api/radar/beta-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleAction(requestId: string, action: 'approve' | 'reject') {
    if (!superadminPwd.trim()) {
      setMessage({ type: 'err', text: 'Saisissez le mot de passe superadmin.' });
      return;
    }
    setActionLoading(requestId);
    setMessage(null);
    try {
      const res = await fetch('/api/radar/beta-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          action,
          superadmin_password: superadminPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMessage({ type: 'ok', text: action === 'approve' ? 'Accès approuvé.' : 'Demande rejetée.' });
      fetchRequests();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    }
    setActionLoading(null);
  }

  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Mot de passe superadmin</label>
        <input
          type="password"
          className="input max-w-xs"
          value={superadminPwd}
          onChange={e => setSuperadminPwd(e.target.value)}
          placeholder="Requis pour approuver/rejeter"
        />
      </div>

      {message && (
        <p className={message.type === 'ok' ? 'text-emerald-400 text-sm' : 'text-red-400 text-sm'}>
          {message.text}
        </p>
      )}

      <div className="card">
        <h2 className="text-lg font-medium text-slate-100 mb-4">
          Demandes en attente ({pending.length})
        </h2>
        {loading && <p className="text-slate-500 text-sm">Chargement...</p>}
        {!loading && pending.length === 0 && (
          <p className="text-slate-500 text-sm">Aucune demande en attente.</p>
        )}
        {pending.map(req => (
          <div key={req.id} className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
            <div>
              <span className="text-slate-200 font-medium">{req.profiles?.identifiant ?? '?'}</span>
              <span className="text-slate-500 ml-2 text-xs">({req.profiles?.role})</span>
              <p className="text-slate-500 text-xs">{new Date(req.created_at).toLocaleString('fr-FR')}</p>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-emerald-700 text-white text-xs hover:bg-emerald-600 disabled:opacity-50"
                onClick={() => handleAction(req.id, 'approve')}
                disabled={actionLoading === req.id}
              >
                Approuver
              </button>
              <button
                className="px-3 py-1 rounded bg-red-700 text-white text-xs hover:bg-red-600 disabled:opacity-50"
                onClick={() => handleAction(req.id, 'reject')}
                disabled={actionLoading === req.id}
              >
                Rejeter
              </button>
            </div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-100 mb-4">Historique</h2>
          {history.map(req => (
            <div key={req.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0 text-sm">
              <div>
                <span className="text-slate-300">{req.profiles?.identifiant ?? '?'}</span>
                <span className="text-slate-500 ml-2 text-xs">{new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <span className={req.status === 'approved' ? 'text-emerald-400 text-xs' : 'text-red-400 text-xs'}>
                {req.status === 'approved' ? '✓ Approuvé' : '✗ Rejeté'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
