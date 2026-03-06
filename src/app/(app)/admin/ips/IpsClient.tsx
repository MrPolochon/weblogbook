'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Loader2, Check, X, RefreshCw } from 'lucide-react';

type AccessStatus = { hasAccess: boolean; requestPending: boolean; requestId?: string };
type PendingRequest = { id: string; requested_by: string; requested_at: string; identifiant: string };
type ProfileRow = { id: string; identifiant: string; role: string | null; last_login_ip: string | null; last_login_at: string | null };
type HistoryRow = { id: string; user_id: string; identifiant: string; ip: string; previous_ip: string | null; user_agent: string | null; created_at: string };

function formatDate(d: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

function deviceType(ua: string | null): string {
  if (!ua) return '—';
  if (/bot|crawler|spider/i.test(ua)) return 'Bot';
  if (/mobile|android|iphone|ipad|webos/i.test(ua)) return 'Mobile';
  if (/tablet|ipad/i.test(ua)) return 'Tablette';
  return 'Desktop';
}

export default function IpsClient() {
  const router = useRouter();
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [step, setStep] = useState<'password' | 'code' | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/admin/superadmin/ip-access-status');
      const data = await res.json();
      setStatus({ hasAccess: data.hasAccess ?? false, requestPending: data.requestPending ?? false, requestId: data.requestId });
    } catch {
      setStatus({ hasAccess: false, requestPending: false });
    }
  }

  async function fetchPendingRequests() {
    try {
      const res = await fetch('/api/admin/superadmin/pending-requests');
      const data = await res.json();
      setPendingRequests(data.requests ?? []);
    } catch {
      setPendingRequests([]);
    }
  }

  async function fetchIpsData() {
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin/superadmin/ips');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProfiles(data.profiles ?? []);
      setHistory(data.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    fetchPendingRequests();
  }, []);

  useEffect(() => {
    if (status?.hasAccess) {
      fetchIpsData();
    }
  }, [status?.hasAccess]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/superadmin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setStep('code');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/superadmin/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.replace(/\s/g, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setStep(null);
      setCode('');
      await fetchStatus();
      await fetchPendingRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    setError(null);
    try {
      const res = await fetch('/api/admin/superadmin/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      await fetchPendingRequests();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function handleReject(requestId: string) {
    setError(null);
    try {
      const res = await fetch('/api/admin/superadmin/reject-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      await fetchPendingRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  if (status === null) {
    return (
      <div className="card flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Demandes en attente d'approbation (pour les autres admins) */}
      {pendingRequests.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            Demandes en attente d&apos;approbation
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Un administrateur a demandé l&apos;accès à la liste des IP. Approuvez ou refusez.
          </p>
          <ul className="space-y-3">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-200 font-medium">{r.identifiant}</span>
                <span className="text-slate-500 text-sm">{formatDate(r.requested_at)}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(r.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-sm font-medium"
                  >
                    <Check className="h-4 w-4" /> Approuver
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(r.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 text-sm font-medium"
                  >
                    <X className="h-4 w-4" /> Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Demande d'accès : mot de passe + code */}
      {!status.hasAccess && !status.requestPending && step === null && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-4">Demander l&apos;accès</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="label">Mot de passe superadmin</label>
              <input
                type="password"
                className="input w-full max-w-xs"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Envoi du code…' : 'Envoyer le code par email'}
            </button>
          </form>
        </div>
      )}

      {!status.hasAccess && step === 'code' && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-sky-400" />
            Code envoyé à votre email
          </h2>
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <label className="label">Code à 6 chiffres</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input w-full max-w-[8rem] text-center text-xl tracking-widest font-mono"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Vérification…' : 'Valider et demander l\'approbation'}
            </button>
          </form>
        </div>
      )}

      {!status.hasAccess && status.requestPending && step === null && (
        <div className="card border-amber-500/40 bg-amber-500/5">
          <p className="text-amber-200 font-medium flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            En attente de l&apos;approbation d&apos;un autre administrateur
          </p>
          <p className="text-slate-400 text-sm mt-2">
            Tous les admins ont reçu une notification. Dès qu&apos;un d&apos;entre eux approuve votre demande, vous pourrez consulter les IP ici. Vous pouvez rafraîchir la page.
          </p>
          <button
            type="button"
            onClick={() => { fetchStatus(); fetchPendingRequests(); }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4" /> Rafraîchir
          </button>
        </div>
      )}

      {/* Données IP (accès accordé) */}
      {status.hasAccess && (
        <>
          <p className="text-emerald-400 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Accès autorisé (valide 15 minutes). Rafraîchir recharge les données.
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="card">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Dernière IP par compte</h2>
            {loadingData ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-sky-400" /></div>
            ) : profiles.length === 0 ? (
              <p className="text-slate-500">Aucune donnée (aucune connexion avec IP enregistrée).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600 text-left text-slate-400">
                      <th className="pb-2 pr-4">Identifiant</th>
                      <th className="pb-2 pr-4">Rôle</th>
                      <th className="pb-2 pr-4">Dernière IP</th>
                      <th className="pb-2">Dernière connexion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id} className="border-b border-slate-700/50">
                        <td className="py-2 pr-4 font-medium text-slate-200">{p.identifiant}</td>
                        <td className="py-2 pr-4 text-slate-300">{p.role ?? '—'}</td>
                        <td className="py-2 pr-4 text-slate-300 font-mono text-xs">{p.last_login_ip ?? '—'}</td>
                        <td className="py-2 text-slate-400 text-xs">{formatDate(p.last_login_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Historique des changements d&apos;IP</h2>
            {loadingData ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-sky-400" /></div>
            ) : history.length === 0 ? (
              <p className="text-slate-500">Aucun historique (table login_ip_history vide ou non créée).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600 text-left text-slate-400">
                      <th className="pb-2 pr-4">Date / heure</th>
                      <th className="pb-2 pr-4">Compte</th>
                      <th className="pb-2 pr-4">IP précédente</th>
                      <th className="pb-2 pr-4">Nouvelle IP</th>
                      <th className="pb-2">Type appareil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-700/50">
                        <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{formatDate(h.created_at)}</td>
                        <td className="py-2 pr-4 font-medium text-slate-200">{h.identifiant}</td>
                        <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{h.previous_ip ?? '—'}</td>
                        <td className="py-2 pr-4 text-slate-300 font-mono text-xs">{h.ip}</td>
                        <td className="py-2 text-slate-400">{deviceType(h.user_agent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
