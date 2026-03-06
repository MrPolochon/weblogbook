'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Loader2, Check, X, RefreshCw } from 'lucide-react';

/** Palette de couleurs bien distinctes pour grouper les IP identiques (jamais deux couleurs similaires). */
const DUPLICATE_IP_PALETTE = [
  'bg-red-500/20 border-l-4 border-red-400',
  'bg-blue-500/20 border-l-4 border-blue-400',
  'bg-emerald-500/20 border-l-4 border-emerald-400',
  'bg-amber-500/20 border-l-4 border-amber-400',
  'bg-violet-500/20 border-l-4 border-violet-400',
  'bg-cyan-500/20 border-l-4 border-cyan-400',
  'bg-rose-500/20 border-l-4 border-rose-400',
  'bg-orange-500/20 border-l-4 border-orange-400',
  'bg-teal-500/20 border-l-4 border-teal-400',
  'bg-fuchsia-500/20 border-l-4 border-fuchsia-400',
  'bg-lime-500/20 border-l-4 border-lime-400',
  'bg-indigo-500/20 border-l-4 border-indigo-400',
] as const;

/** Retourne un map IP -> classe CSS pour les IP présentes plus d'une fois (même couleur par groupe). */
function useDuplicateIpColors(profiles: ProfileRow[]): Map<string, string> {
  return useMemo(() => {
    const countByIp = new Map<string, number>();
    for (const p of profiles) {
      const ip = p.last_login_ip?.trim() ?? '';
      if (!ip) continue;
      countByIp.set(ip, (countByIp.get(ip) ?? 0) + 1);
    }
    const duplicateIps = [...countByIp.entries()].filter(([, n]) => n > 1).map(([ip]) => ip);
    const ipToColor = new Map<string, string>();
    duplicateIps.forEach((ip, i) => {
      ipToColor.set(ip, DUPLICATE_IP_PALETTE[i % DUPLICATE_IP_PALETTE.length]);
    });
    return ipToColor;
  }, [profiles]);
}

type AccessStatus = {
  hasAccess: boolean;
  requestPending: boolean;
  requestId?: string;
  codeToDisplay?: string;
  requester_validated?: boolean;
  approver_validated?: boolean;
};
type PendingRequest = { id: string; requested_by: string; approver_id?: string; requested_at: string; identifiant: string; approver_identifiant?: string; canParticipate?: boolean };
type ProfileRow = { id: string; identifiant: string; role: string | null; last_login_ip: string | null; last_login_at: string | null };
type HistoryRow = { id: string; user_id: string; identifiant: string; ip: string; previous_ip: string | null; user_agent: string | null; created_at: string };
type ApprovalViewState = {
  requestId: string;
  codeToDisplay: string;
  role: 'requester' | 'approver';
  requesterIdentifiant?: string;
  requester_validated?: boolean;
  approver_validated?: boolean;
};

function formatDate(d: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatDateUTC(d: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' }) + ' UTC';
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
  const [emailMasked, setEmailMasked] = useState<string>('');
  const [identifiantSent, setIdentifiantSent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [approvalView, setApprovalView] = useState<ApprovalViewState | null>(null);
  const [crossCode, setCrossCode] = useState('');
  const [submittingCross, setSubmittingCross] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const duplicateIpColors = useDuplicateIpColors(profiles);
  const selectedProfile = selectedProfileId ? profiles.find((p) => p.id === selectedProfileId) : null;
  const selectedHistory = selectedProfileId
    ? [...history.filter((h) => h.user_id === selectedProfileId)].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : [];

  async function fetchStatus() {
    try {
      const res = await fetch('/api/admin/superadmin/ip-access-status');
      const data = await res.json();
      setStatus({
        hasAccess: data.hasAccess ?? false,
        requestPending: data.requestPending ?? false,
        requestId: data.requestId,
        codeToDisplay: data.codeToDisplay,
        requester_validated: data.requester_validated,
        approver_validated: data.approver_validated,
      });
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
      setEmailMasked(data.emailMasked ?? '');
      setIdentifiantSent(data.identifiant ?? '');
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
      setStatus((s) => (s ? { ...s, requestPending: true, requestId: data.requestId, codeToDisplay: data.codeToDisplay } : s));
      await fetchPendingRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function openApprovalView(requestId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/superadmin/request/${requestId}/approval-view`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setApprovalView({
        requestId,
        codeToDisplay: data.codeToDisplay ?? '',
        role: data.role ?? 'approver',
        requesterIdentifiant: data.requesterIdentifiant,
        requester_validated: data.requester_validated,
        approver_validated: data.approver_validated,
      });
      setCrossCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function handleSubmitCrossCode(e: React.FormEvent, requestId: string) {
    e.preventDefault();
    setError(null);
    setSubmittingCross(true);
    try {
      const res = await fetch('/api/admin/superadmin/submit-approval-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, code: crossCode.replace(/\s/g, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.forceLogout) {
        const { createClient } = await import('@/lib/supabase/client');
        await createClient().auth.signOut();
        window.location.href = '/login?message=security_logout';
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (data.approved) {
        setApprovalView(null);
        setCrossCode('');
        await fetchStatus();
        await fetchPendingRequests();
        router.refresh();
      } else {
        setCrossCode('');
        setError(null);
        // Garder le code affiché et mettre à jour l'état de validation (les deux doivent valider)
        setApprovalView((av) =>
          av
            ? {
                ...av,
                requester_validated: data.requester_validated ?? av.requester_validated,
                approver_validated: data.approver_validated ?? av.approver_validated,
              }
            : null
        );
        setStatus((s) =>
          s?.requestId === requestId
            ? {
                ...s,
                requester_validated: data.requester_validated ?? s.requester_validated,
                approver_validated: data.approver_validated ?? s.approver_validated,
              }
            : s
        );
        await fetchPendingRequests();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSubmittingCross(false);
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
      {/* Demandes en attente : un autre admin doit participer (validation croisée par codes) */}
      {pendingRequests.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-200 mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            Demandes en attente d&apos;approbation
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Un admin a demandé l&apos;accès. Un autre admin doit participer : chacun affiche un code et saisit le code de l&apos;autre. Code incorrect = demande annulée et les deux déconnectés.
          </p>
          <ul className="space-y-3">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-200 font-medium">{r.identifiant}</span>
                <span className="text-slate-500 text-sm">{formatDate(r.requested_at)}</span>
                {r.approver_identifiant && <span className="text-slate-500 text-sm">Approbateur : {r.approver_identifiant}</span>}
                {r.canParticipate !== false ? (
                  <button
                    type="button"
                    onClick={() => openApprovalView(r.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/40 text-sm font-medium"
                  >
                    Participer à l&apos;approbation
                  </button>
                ) : (
                  <span className="text-slate-500 text-sm">C&apos;est votre demande — un autre admin doit participer</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Vue approbation (autre admin) : afficher son code + saisir le code du demandeur */}
      {approvalView && (
        <div className="card border-sky-500/40 bg-sky-500/5">
          <h2 className="text-lg font-medium text-slate-200 mb-2">
            {approvalView.role === 'approver' && approvalView.requesterIdentifiant
              ? `Approbation — demande de ${approvalView.requesterIdentifiant}`
              : 'Validation croisée'}
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Montrez votre code à l&apos;autre admin. Puis saisissez le code affiché chez lui. Les codes restent affichés jusqu&apos;à ce que les deux aient validé.
          </p>
          <div className="mb-6 p-6 rounded-2xl bg-slate-900/80 border-2 border-sky-500/50 text-center">
            <p className="text-slate-400 text-sm mb-2">Votre code à afficher</p>
            <p className="text-4xl md:text-5xl font-mono font-bold tracking-[0.4em] text-sky-300">
              {approvalView.codeToDisplay}
            </p>
          </div>
          {(approvalView.role === 'requester' && approvalView.requester_validated) ||
          (approvalView.role === 'approver' && approvalView.approver_validated) ? (
            <div className="space-y-3">
              <p className="text-emerald-400 text-sm font-medium">Vous avez validé. En attente de l&apos;autre admin.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/admin/superadmin/request/${approvalView.requestId}/approval-view`);
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        if (res.status === 400) {
                          setApprovalView(null);
                          setCrossCode('');
                          await fetchStatus();
                          await fetchPendingRequests();
                          return;
                        }
                        throw new Error(data.error || 'Erreur');
                      }
                      setApprovalView((av) => (av ? { ...av, ...data } : null));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Erreur');
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium"
                >
                  <RefreshCw className="h-4 w-4" /> Rafraîchir
                </button>
                <button type="button" onClick={() => { setApprovalView(null); setCrossCode(''); setError(null); }} className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium">
                  Quitter la vue
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => handleSubmitCrossCode(e, approvalView.requestId)} className="space-y-4">
              <div>
                <label className="label">Code affiché chez l&apos;autre admin (6 chiffres)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="input w-full max-w-[10rem] text-center text-xl tracking-widest font-mono"
                  value={crossCode}
                  onChange={(e) => setCrossCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={submittingCross}>
                  {submittingCross ? 'Vérification…' : 'Valider'}
                </button>
                <button type="button" onClick={() => { setApprovalView(null); setCrossCode(''); setError(null); }} className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium">
                  Annuler
                </button>
              </div>
            </form>
          )}
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
          {(emailMasked || identifiantSent) && (
            <p className="text-slate-400 text-sm mb-4">
              Code envoyé à <span className="text-sky-300 font-medium">{emailMasked || 'votre adresse'}</span>
              {identifiantSent && (
                <> (identifiant : <span className="font-medium text-slate-200">{identifiantSent}</span>)</>
              )}
            </p>
          )}
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

      {!status.hasAccess && status.requestPending && step === null && !approvalView && (
        <div className="card border-amber-500/40 bg-amber-500/5">
          <h2 className="text-lg font-medium text-amber-200 mb-2">Validation croisée avec un autre admin</h2>
          <p className="text-slate-400 text-sm mb-4">
            Un autre admin doit participer : il affichera son code, vous affichez le vôtre ci-dessous. Chacun saisit le code de l&apos;autre. Les codes restent affichés jusqu&apos;à ce que les deux aient validé. <strong className="text-amber-200">Code incorrect = demande annulée et les deux comptes déconnectés.</strong>
          </p>
          <div className="mb-6 p-6 rounded-2xl bg-slate-900/80 border-2 border-amber-500/50 text-center">
            <p className="text-slate-400 text-sm mb-2">Votre code à montrer à l&apos;autre admin</p>
            <p className="text-4xl md:text-5xl font-mono font-bold tracking-[0.4em] text-amber-300">
              {status.codeToDisplay ?? '—'}
            </p>
          </div>
          {status.requester_validated ? (
            <div className="space-y-3">
              <p className="text-emerald-400 text-sm font-medium">Vous avez validé. En attente de l&apos;autre admin.</p>
              <button
                type="button"
                onClick={() => { fetchStatus(); fetchPendingRequests(); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium"
              >
                <RefreshCw className="h-4 w-4" /> Rafraîchir
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => status.requestId && handleSubmitCrossCode(e, status.requestId)} className="space-y-4">
              <div>
                <label className="label">Code affiché chez l&apos;autre admin (6 chiffres)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="input w-full max-w-[10rem] text-center text-xl tracking-widest font-mono"
                  value={crossCode}
                  onChange={(e) => setCrossCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button type="submit" className="btn-primary" disabled={submittingCross || !status.requestId}>
                {submittingCross ? 'Vérification…' : 'Valider'}
              </button>
            </form>
          )}
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
            <h2 className="text-lg font-medium text-slate-200 mb-4">Liste des comptes</h2>
            <p className="text-slate-500 text-sm mb-3">Cliquez sur un identifiant pour voir l&apos;IP active et l&apos;historique des changements d&apos;IP (après vérification du code par mail). Même couleur = même IP partagée.</p>
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
                    {profiles.map((p) => {
                      const ip = p.last_login_ip?.trim() ?? null;
                      const rowColor = ip ? duplicateIpColors.get(ip) : undefined;
                      return (
                        <tr
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedProfileId(p.id)}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedProfileId(p.id)}
                          className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 ${rowColor ?? ''}`}
                        >
                          <td className="py-2 pr-4 font-medium text-slate-200">{p.identifiant}</td>
                          <td className="py-2 pr-4 text-slate-300">{p.role ?? '—'}</td>
                          <td className="py-2 pr-4 text-slate-300 font-mono text-xs">{p.last_login_ip ?? '—'}</td>
                          <td className="py-2 text-slate-400 text-xs">{formatDate(p.last_login_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedProfile && (
            <div className="card border-sky-500/40 bg-sky-500/5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-medium text-slate-200">Détail — {selectedProfile.identifiant}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedProfileId(null)}
                  className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium"
                >
                  Retour à la liste
                </button>
              </div>
              <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-600">
                <p className="text-slate-400 text-sm mb-1">IP active (dernière connexion, après vérification du code)</p>
                <p className="text-slate-200 font-mono text-sm">{selectedProfile.last_login_ip ?? '—'}</p>
                <p className="text-slate-500 text-xs mt-1">Dernière connexion : {formatDate(selectedProfile.last_login_at)}</p>
              </div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Historique des changements d&apos;IP (ordre date/heure UTC)</h3>
              <p className="text-slate-500 text-xs mb-3">Chaque ligne = une connexion depuis une IP différente de la précédente (code email validé). L&apos;IP active a alors changé ; l&apos;ancienne IP reste dans l&apos;historique avec sa date.</p>
              {selectedHistory.length === 0 ? (
                <p className="text-slate-500 text-sm">Aucun changement d&apos;IP enregistré pour ce compte.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-left text-slate-400">
                        <th className="pb-2 pr-4">Date / heure (UTC)</th>
                        <th className="pb-2 pr-4">Nouvelle IP (devenue active)</th>
                        <th className="pb-2 pr-4">IP précédente</th>
                        <th className="pb-2">Type appareil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHistory.map((h) => (
                        <tr key={h.id} className="border-b border-slate-700/50">
                          <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{formatDateUTC(h.created_at)}</td>
                          <td className="py-2 pr-4 text-slate-200 font-mono text-xs">{h.ip}</td>
                          <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{h.previous_ip ?? '—'}</td>
                          <td className="py-2 text-slate-400">{deviceType(h.user_agent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
