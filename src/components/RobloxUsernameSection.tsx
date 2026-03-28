'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Gamepad2, Check, Loader2 } from 'lucide-react';

interface Props {
  variant?: 'default' | 'atc' | 'siavi';
}

export default function RobloxUsernameSection({ variant = 'default' }: Props) {
  const isAtcOrSiavi = variant === 'atc' || variant === 'siavi';
  const [username, setUsername] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('roblox_username')
        .eq('id', user.id)
        .single();
      const val = data?.roblox_username ?? '';
      setUsername(val);
      setSaved(val);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const trimmed = username.trim() || null;
    const { error } = await supabase
      .from('profiles')
      .update({ roblox_username: trimmed })
      .eq('id', user.id);

    if (error) {
      setMessage({ type: 'err', text: 'Erreur lors de la sauvegarde.' });
    } else {
      setSaved(trimmed ?? '');
      setMessage({ type: 'ok', text: 'Pseudo Roblox enregistré.' });
    }
    setSaving(false);
  }

  const isDirty = username.trim() !== saved;

  const cardCl = isAtcOrSiavi ? 'rounded-xl border border-slate-200 bg-white p-4' : 'card';
  const titleCl = isAtcOrSiavi ? 'text-slate-800' : 'text-slate-200';
  const mutedCl = isAtcOrSiavi ? 'text-slate-500' : 'text-slate-400';
  const inputCl = isAtcOrSiavi
    ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500'
    : 'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const btnCl = isAtcOrSiavi
    ? 'rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-white text-sm font-medium transition-colors disabled:opacity-50'
    : 'btn-primary disabled:opacity-50';

  if (loading) return null;

  return (
    <div className={cardCl}>
      <div className="flex items-center gap-2 mb-2">
        <Gamepad2 className={`h-4 w-4 ${mutedCl}`} />
        <h2 className={`text-sm font-bold ${titleCl}`}>Pseudo Roblox</h2>
      </div>
      <p className={`text-xs ${mutedCl} mb-3`}>
        Votre pseudo Roblox permet de vous identifier sur le radar ATC lorsque vous volez dans PTFS.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); setMessage(null); }}
          placeholder="Ex: MrPolochon"
          className={inputCl}
        />
        <button onClick={handleSave} disabled={saving || !isDirty} className={btnCl}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
