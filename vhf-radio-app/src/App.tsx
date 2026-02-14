import { useState, useEffect } from 'react';
import { Loader2, Radio } from 'lucide-react';
import LoginScreen from './LoginScreen';
import RadioScreen from './RadioScreen';
import AdminFreqs from './AdminFreqs';
import { supabase } from './lib/supabase';

interface UserProfile {
  id: string;
  identifiant: string;
  role: string;
  atc: boolean;
  siavi: boolean;
}

type Screen = 'loading' | 'login' | 'radio' | 'admin';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Auto-login from stored session
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setScreen('login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('identifiant, role, atc, siavi')
        .eq('id', session.user.id)
        .single();

      if (!profileData) {
        setScreen('login');
        return;
      }

      setProfile({
        id: session.user.id,
        identifiant: profileData.identifiant,
        role: profileData.role,
        atc: profileData.atc ?? false,
        siavi: profileData.siavi ?? false,
      });
      setScreen('radio');
    }

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setProfile(null);
        setScreen('login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 mb-4">
            <Radio className="h-8 w-8 text-emerald-400" />
          </div>
          <Loader2 className="h-6 w-6 text-slate-500 animate-spin mx-auto mt-4" />
          <p className="text-xs text-slate-500 mt-2">Chargement...</p>
        </div>
      </div>
    );
  }

  if (screen === 'login' || !profile) {
    return (
      <LoginScreen
        onLogin={(p) => {
          setProfile(p);
          setScreen('radio');
        }}
      />
    );
  }

  if (screen === 'admin') {
    return <AdminFreqs onBack={() => setScreen('radio')} />;
  }

  return (
    <RadioScreen
      profile={profile}
      onLogout={() => {
        setProfile(null);
        setScreen('login');
      }}
      onAdmin={() => setScreen('admin')}
    />
  );
}
