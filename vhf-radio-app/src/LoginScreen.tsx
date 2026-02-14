import { useState } from 'react';
import { Radio, LogIn, AlertCircle, Loader2, Plane, Flame } from 'lucide-react';
import { supabase } from './lib/supabase';

const EMAIL_DOMAIN = 'logbook.local';

function identifiantToEmail(identifiant: string): string {
  return `${String(identifiant).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

type RadioMode = 'pilot' | 'atc' | 'afis';

interface LoginScreenProps {
  onLogin: (profile: { id: string; identifiant: string; role: string; atc: boolean; siavi: boolean }, mode: RadioMode) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<RadioMode>('pilot');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const email = identifiantToEmail(identifiant);

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Identifiant ou mot de passe incorrect'
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

      // Validate role access
      if (mode === 'atc') {
        const canAtc = profile.role === 'admin' || profile.role === 'atc' || profile.atc;
        if (!canAtc) {
          setError('Ce compte n\'a pas accès en tant qu\'ATC.');
          setLoading(false);
          return;
        }
      } else if (mode === 'afis') {
        const canAfis = profile.role === 'admin' || profile.role === 'siavi' || profile.siavi;
        if (!canAfis) {
          setError('Ce compte n\'a pas accès en tant qu\'AFIS.');
          setLoading(false);
          return;
        }
      } else {
        // Pilot — check account isn't exclusively ATC/SIAVI
        if (profile.role === 'atc') {
          setError('Ce compte est uniquement ATC. Sélectionne "ATC" pour te connecter.');
          setLoading(false);
          return;
        }
        if (profile.role === 'siavi') {
          setError('Ce compte est uniquement SIAVI. Sélectionne "AFIS" pour te connecter.');
          setLoading(false);
          return;
        }
      }

      onLogin({
        id: data.user.id,
        identifiant: profile.identifiant,
        role: profile.role,
        atc: profile.atc ?? false,
        siavi: profile.siavi ?? false,
      }, mode);
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

        {/* Mode selector */}
        <div className="flex gap-1 mb-5 p-1 bg-slate-800/60 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('pilot')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${
              mode === 'pilot'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Plane className="h-4 w-4" />
            Pilote
          </button>
          <button
            type="button"
            onClick={() => setMode('atc')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${
              mode === 'atc'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Radio className="h-4 w-4" />
            ATC
          </button>
          <button
            type="button"
            onClick={() => setMode('afis')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${
              mode === 'afis'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Flame className="h-4 w-4" />
            AFIS
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Identifiant</label>
            <input
              type="text"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-sm"
              placeholder="Ton identifiant"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white ${
              mode === 'pilot'
                ? 'bg-sky-600 hover:bg-sky-700'
                : mode === 'atc'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connexion...</>
            ) : (
              <><LogIn className="h-4 w-4" /> {
                mode === 'pilot' ? 'Connexion Pilote' :
                mode === 'atc' ? 'Connexion ATC' :
                'Connexion AFIS'
              }</>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          Mêmes identifiants que sur WebLogbook
        </p>
      </div>
    </div>
  );
}
