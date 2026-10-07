'use client';
import { useState, useEffect } from 'react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { fetchJson } from '@/lib/fetch-json';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export default function PasswordlessLogin({ redirectTo }: { redirectTo: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(false);
  const [discord, setDiscord] = useState(false);
  useEffect(() => { setSupported(browserSupportsWebAuthn()); void fetchJson<{ discord: boolean }>('/api/auth/login-methods').then(d=>setDiscord(d.discord)).catch(()=>{}); }, []);
  async function login() {
    setBusy(true); setError('');
    try {
      const options = await fetchJson<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkeys/login/options', { method: 'POST' });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await fetchJson<{ forceEmail: boolean }>('/api/auth/passkeys/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }) });
      window.location.assign(result.forceEmail ? '/login?step=verify&redirect='+encodeURIComponent(redirectTo) : redirectTo);
    } catch (e) { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Vérification annulée. Vous pouvez réessayer ou utiliser votre mot de passe.' : e instanceof Error ? e.message : 'Connexion impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-slate-700 pt-4 space-y-3">
    <p className="text-xs text-slate-400 text-center">Ou avec un moyen déjà lié à votre compte</p>
    <button type="button" disabled={!supported || busy} onClick={()=>void login()} className="w-full rounded-lg border border-sky-700 py-3 text-sky-200 disabled:opacity-50">{busy ? 'Vérification…' : 'Se connecter avec une passkey'}</button>
    {discord && <a className="block text-center rounded-lg bg-indigo-700 py-3 text-white" href="/api/auth/discord/login">Se connecter avec Discord</a>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <p className="text-xs text-slate-500">Ajoutez une passkey ou liez Discord depuis votre profil. La vérification email périodique reste requise.</p>
  </div>;
}
