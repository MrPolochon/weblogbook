'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function CompteForm({ armee: armeeInitial, isAdmin, variant = 'default', showArmee = true }: { armee: boolean; isAdmin: boolean; variant?: 'default' | 'atc' | 'siavi'; showArmee?: boolean }) {
  const isSiavi = variant === 'siavi';
  const isAtc = variant === 'atc';
  const isAtcOrSiavi = isAtc || isSiavi;
  const textTitle = isAtcOrSiavi ? 'text-slate-800' : 'text-slate-200';
  const textMuted = isAtcOrSiavi ? 'text-slate-600' : 'text-slate-400';
  const textCheck = isAtcOrSiavi ? 'text-slate-700' : 'text-slate-300';
  
  // Classes spécifiques pour SIAVI (fond blanc, texte foncé)
  const labelClass = isSiavi ? 'block text-sm font-bold text-red-800 mb-1' : 'label';
  const inputClass = isSiavi ? 'block w-full rounded-lg border-2 border-slate-300 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : 'input';
  const cardClass = isSiavi ? '' : 'card'; // SIAVI n'utilise pas .card car parent a déjà le style
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [armee, setArmee] = useState(armeeInitial);
  const [loadingArmee, setLoadingArmee] = useState(false);
  const [messageArmee, setMessageArmee] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { setArmee(armeeInitial); }, [armeeInitial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ type: 'err', text: 'Le mot de passe doit faire au moins 8 caractères.' });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'err', text: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: 'ok', text: 'Mot de passe mis à jour.' });
      setPassword('');
      setConfirm('');
    } catch (err: unknown) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la mise à jour.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleArmeeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessageArmee(null);
    setLoadingArmee(true);
    try {
      const res = await fetch('/api/compte', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ armee }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMessageArmee({ type: 'ok', text: 'Rôle Armée mis à jour.' });
      router.refresh();
    } catch (err: unknown) {
      setMessageArmee({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setLoadingArmee(false);
    }
  }

  return (
    <>
      {isAdmin && showArmee && (
        <div className={cardClass}>
          <h2 className={`text-lg font-medium mb-4 ${textTitle}`}>Rôle Armée (Espace militaire)</h2>
          <p className={`${textMuted} text-sm mb-3`}>En tant qu&apos;admin, vous pouvez vous attribuer le rôle Armée pour accéder à l&apos;Espace militaire. Le rôle Armée requiert l&apos;accès à l&apos;espace pilote.</p>
          <form onSubmit={handleArmeeSubmit} className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={armee} onChange={(e) => setArmee(e.target.checked)} className="rounded" />
              <span className={textCheck}>J&apos;ai le rôle Armée</span>
            </label>
            {messageArmee && (
              <p className={messageArmee.type === 'ok' ? 'text-emerald-500 text-sm font-medium' : 'text-red-600 text-sm font-medium'}>{messageArmee.text}</p>
            )}
            <button type="submit" className={isSiavi ? 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50' : 'btn-primary'} disabled={loadingArmee}>
              {loadingArmee ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </div>
      )}
      <div className={cardClass}>
      <h2 className={`text-lg font-bold mb-4 ${isSiavi ? 'text-slate-800' : textTitle}`}>Changer le mot de passe</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Nouveau mot de passe</label>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={labelClass}>Confirmer</label>
          <input
            type="password"
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {message && (
          <p className={message.type === 'ok' ? (isSiavi ? 'text-emerald-600 text-sm font-medium' : 'text-emerald-400 text-sm') : (isSiavi ? 'text-red-600 text-sm font-medium' : 'text-red-400 text-sm')}>
            {message.text}
          </p>
        )}
        <button type="submit" className={isSiavi ? 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50' : 'btn-primary'} disabled={loading}>
          {loading ? 'Enregistrement…' : 'Mettre à jour'}
        </button>
      </form>
    </div>
    </>
  );
}
