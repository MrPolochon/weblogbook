import { useState, useEffect } from 'react';
import { LogOut, Settings, Radio } from 'lucide-react';
import VhfRadio from './components/VhfRadio';
import { supabase } from './lib/supabase';

interface UserProfile {
  id: string;
  identifiant: string;
  role: string;
  atc: boolean;
  siavi: boolean;
}

interface RadioScreenProps {
  profile: UserProfile;
  onLogout: () => void;
  onAdmin: () => void;
}

export default function RadioScreen({ profile, onLogout, onAdmin }: RadioScreenProps) {
  const [lockedFrequency, setLockedFrequency] = useState<string | null>(null);
  const [mode, setMode] = useState<'pilot' | 'atc' | 'afis'>('pilot');
  const [sessionInfo, setSessionInfo] = useState<string>('');

  useEffect(() => {
    async function detectMode() {
      // Check if user has an active ATC session
      if (profile.atc) {
        const { data: atcSession } = await supabase
          .from('atc_sessions')
          .select('aeroport, position')
          .eq('user_id', profile.id)
          .maybeSingle();
        
        if (atcSession) {
          setMode('atc');
          setSessionInfo(`${atcSession.aeroport} ${atcSession.position}`);
          // Fetch locked frequency
          const { data: vhfData } = await supabase
            .from('vhf_position_frequencies')
            .select('frequency')
            .eq('aeroport', atcSession.aeroport)
            .eq('position', atcSession.position)
            .maybeSingle();
          if (vhfData?.frequency) {
            setLockedFrequency(vhfData.frequency);
          }
          return;
        }
      }

      // Check if user has an active AFIS session
      if (profile.siavi) {
        const { data: afisSession } = await supabase
          .from('afis_sessions')
          .select('aeroport, est_afis')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (afisSession?.est_afis) {
          setMode('afis');
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
          return;
        }
      }

      // Default: pilot mode (free frequency)
      setMode('pilot');
      setLockedFrequency(null);
      setSessionInfo('');
    }

    detectMode();

    // Re-check every 30s in case user opens/closes a session on the website
    const interval = setInterval(detectMode, 30000);
    return () => clearInterval(interval);
  }, [profile]);

  const participantName = sessionInfo
    ? `${profile.identifiant} (${sessionInfo})`
    : profile.identifiant;

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300">{profile.identifiant}</span>
          {sessionInfo && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {sessionInfo}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            mode === 'atc' ? 'bg-emerald-500/20 text-emerald-400' :
            mode === 'afis' ? 'bg-red-500/20 text-red-400' :
            'bg-sky-500/20 text-sky-400'
          }`}>
            {mode === 'atc' ? 'ATC' : mode === 'afis' ? 'AFIS' : 'PILOTE'}
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

      {/* Radio */}
      <div className="flex-1 p-4 flex flex-col justify-center">
        <VhfRadio
          mode={mode}
          lockedFrequency={lockedFrequency ?? undefined}
          participantName={participantName}
        />
      </div>

      {/* Footer */}
      <div className="text-center py-2">
        <p className="text-[9px] text-slate-600">WebLogbook VHF Radio v1.0</p>
      </div>
    </div>
  );
}
