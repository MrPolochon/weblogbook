import { useState, useEffect } from 'react';
import { LogOut, Settings, Radio, Plane, Flame } from 'lucide-react';
import VhfRadio from './components/VhfRadio';
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
  onLogout: () => void;
  onAdmin: () => void;
}

export default function RadioScreen({ profile, initialMode, onLogout, onAdmin }: RadioScreenProps) {
  const [lockedFrequency, setLockedFrequency] = useState<string | null>(null);
  const [mode] = useState<RadioMode>(initialMode);
  const [sessionInfo, setSessionInfo] = useState<string>('');
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    async function loadFrequency() {
      setNoSession(false);
      setLockedFrequency(null);
      setSessionInfo('');

      if (mode === 'atc') {
        // Check if user has an active ATC session on the website
        const { data: atcSession } = await supabase
          .from('atc_sessions')
          .select('aeroport, position')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (atcSession) {
          setSessionInfo(`${atcSession.aeroport} ${atcSession.position}`);
          const { data: vhfData } = await supabase
            .from('vhf_position_frequencies')
            .select('frequency')
            .eq('aeroport', atcSession.aeroport)
            .eq('position', atcSession.position)
            .maybeSingle();
          if (vhfData?.frequency) {
            setLockedFrequency(vhfData.frequency);
          }
        } else {
          setNoSession(true);
        }
      } else if (mode === 'afis') {
        const { data: afisSession } = await supabase
          .from('afis_sessions')
          .select('aeroport, est_afis')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (afisSession?.est_afis) {
          setSessionInfo(`${afisSession.aeroport} AFIS`);
          const { data: vhfData } = await supabase
            .from('vhf_position_frequencies')
            .select('frequency')
            .eq('aeroport', afisSession.aeroport)
            .eq('position', 'AFIS')
            .maybeSingle();
          if (vhfData?.frequency) {
            setLockedFrequency(vhfData.frequency);
          }
        } else {
          setNoSession(true);
        }
      }
      // Pilot mode: no locked frequency, no session needed
    }

    loadFrequency();

    // Re-check every 15s in case user opens/closes a session on the website
    const interval = setInterval(loadFrequency, 15000);
    return () => clearInterval(interval);
  }, [profile, mode]);

  const participantName = sessionInfo
    ? `${profile.identifiant} (${sessionInfo})`
    : profile.identifiant;

  async function handleLogout() {
    await supabase.auth.signOut();
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
            Vérification automatique toutes les 15 secondes...
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
