import { useState } from 'react';
import { Radio, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';

interface LoginScreenProps {
  onLogin: (profile: { id: string; identifiant: string; role: string; atc: boolean; siavi: boolean }) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect'
          : authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError('Impossible de se connecter');
        setLoading(false);
        return;
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('identifiant, role, atc, siavi')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        setError('Profil introuvable. Vérifie que ton compte existe sur WebLogbook.');
        setLoading(false);
        return;
      }

      onLogin({
        id: data.user.id,
        identifiant: profile.identifiant,
        role: profile.role,
        atc: profile.atc ?? false,
        siavi: profile.siavi ?? false,
      });
    } catch (err) {
      setError('Erreur de connexion. Vérifie ta connexion internet.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 mb-4">
            <Radio className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">VHF Radio</h1>
          <p className="text-sm text-slate-400 mt-1">Connexion WebLogbook</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-sm"
              placeholder="pilote@weblogbook.fr"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connexion...</>
            ) : (
              <><LogIn className="h-4 w-4" /> Se connecter</>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          Utilise les mêmes identifiants que ton compte WebLogbook
        </p>
      </div>
    </div>
  );
}
