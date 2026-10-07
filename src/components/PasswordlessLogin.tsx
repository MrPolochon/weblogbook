'use client';
import { useState, useEffect } from 'react';
import { fetchJson } from '@/lib/fetch-json';
export default function PasswordlessLogin({ redirectTo }: { redirectTo: string }) {
  const [discord, setDiscord] = useState(false);
  useEffect(() => { void fetchJson<{ discord: boolean }>('/api/auth/login-methods').then(d => setDiscord(d.discord)).catch(() => {}); }, []);
  if (!discord) return null;
  return <div className="mt-3 border-t border-slate-700 pt-3 space-y-2">
    <a className="block text-center rounded-lg bg-indigo-700 py-2.5 text-white font-medium" href={'/api/auth/discord/login?redirect=' + encodeURIComponent(redirectTo)}>Se connecter avec Discord</a>
    <p className="text-xs text-slate-400 text-center">Uniquement avec un compte existant et un Discord déjà lié.</p>
  </div>;
}
