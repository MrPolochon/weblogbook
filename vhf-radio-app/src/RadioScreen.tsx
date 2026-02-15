import { useState, useEffect, useRef } from 'react';
import { LogOut, Settings, Radio, Plane, Flame } from 'lucide-react';
import VhfRadio from './components/VhfRadio';
import { API_BASE_URL } from './lib/config';
import { supabase } from './lib/supabase';

interface UserProfile {
  id: string;
  identifiant: string;
  role: string;
  atc: boolean;
  siavi: boolean;
}

type RadioMode = 'pilot' | 'atc' | 'afis';

interface RadioScreenProps {
  profile: UserProfile;
  initialMode: RadioMode;
  accessToken: string;
  onLogout: () => void;
  onAdmin: () => void;
}

export default function RadioScreen({ profile, initialMode, accessToken, onLogout, onAdmin }: RadioScreenProps) {
  const [lockedFrequency, setLockedFrequency] = useState<string | null>(null);
  const [mode] = useState<RadioMode>(initialMode);
  const [sessionInfo, setSessionInfo] = useState<string>('');
  const [noSession, setNoSession] = useState(false);

  // Track last known session info to avoid unnecessary state resets
  const lastSessionKeyRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      if (cancelled) return;

      let newSessionInfo = '';
      let newFrequency: string | null = null;
      let newNoSession = false;

      if (mode === 'pilot') {
        // Pilot mode: no locked frequency, no session needed
      } else {
        try {
          // Get fresh token from session (auto-refreshed by Supabase SDK)
          let freshToken = accessToken;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) freshToken = session.access_token;
          } catch { /* fallback to original token */ }

          const res = await fetch(`${API_BASE_URL}/api/atc/my-session?mode=${mode}`, {
            headers: { 'Authorization': `Bearer ${freshToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.noSession) {
              newNoSession = true;
            } else if (data.session) {
              newSessionInfo = `${data.session.aeroport} ${data.session.position}`;
              if (data.frequency) newFrequency = data.frequency;
            }
          }
        } catch (err) {
          console.error('[RadioScreen] Session check error:', err);
        }
      }

      if (cancelled) return;

      // Only update state if something actually changed
      const sessionKey = `${newSessionInfo}|${newFrequency}|${newNoSession}`;
      if (sessionKey !== lastSessionKeyRef.current) {
        lastSessionKeyRef.current = sessionKey;
        setSessionInfo(newSessionInfo);
        setLockedFrequency(newFrequency);
        setNoSession(newNoSession);
      }
    }

    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile, mode, accessToken]);

  const participantName = sessionInfo
    ? `${profile.identifiant} (${sessionInfo})`
    : profile.identifiant;

  function handleLogout() {
    // Don't call supabase.auth.signOut() — it would invalidate the website session too
    onLogout();
  }

  const modeConfig = {
    pilot: { label: 'PILOTE', color: 'bg-sky-500/20 text-sky-400', icon: Plane },
    atc: { label: 'ATC', color: 'bg-emerald-500/20 text-emerald-400', icon: Radio },
    afis: { label: 'AFIS', color: 'bg-red-500/20 text-red-400', icon: Flame },
  };
  const cfg = modeConfig[mode];
  const ModeIcon = cfg.icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <ModeIcon className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300">{profile.identifiant}</span>
          {sessionInfo && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {sessionInfo}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {profile.role === 'admin' && (
            <button
              onClick={onAdmin}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              title="Gérer les fréquences"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* No session warning for ATC/AFIS */}
      {noSession && mode !== 'pilot' && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-300">
            <strong>Aucune session {mode === 'atc' ? 'ATC' : 'AFIS'} active.</strong>{' '}
            Met-toi en service sur le site WebLogbook pour que ta fréquence soit assignée automatiquement.
          </p>
          <p className="text-[10px] text-amber-400/60 mt-1">
            Vérification automatique toutes les 30 secondes...
          </p>
        </div>
      )}

      {/* Radio */}
      <div className="flex-1 p-4 flex flex-col justify-center">
        {mode === 'pilot' || (lockedFrequency && !noSession) ? (
          <VhfRadio
            mode={mode}
            lockedFrequency={lockedFrequency ?? undefined}
            participantName={participantName}
            accessToken={accessToken}
          />
        ) : noSession ? (
          <div className="text-center py-12">
            <ModeIcon className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-sm">En attente de ta session {mode === 'atc' ? 'ATC' : 'AFIS'}...</p>
            <p className="text-slate-500 text-xs mt-1">Connecte-toi sur le site WebLogbook</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Radio className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Chargement de la fréquence...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-2">
        <p className="text-[9px] text-slate-600">WebLogbook VHF Radio v1.0</p>
      </div>
    </div>
  );
}
