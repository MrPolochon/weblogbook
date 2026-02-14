import { useState, useEffect } from 'react';
import { Radio, Download, RefreshCw, CheckCircle } from 'lucide-react';
import LoginScreen from './LoginScreen';
import RadioScreen from './RadioScreen';
import AdminFreqs from './AdminFreqs';

interface UserProfile {
  id: string;
  identifiant: string;
  role: string;
  atc: boolean;
  siavi: boolean;
}

type RadioMode = 'pilot' | 'atc' | 'afis';
type Screen = 'login' | 'radio' | 'admin';

/* ══════════════════════════════════════════════════
   Auto-Update Banner
   ══════════════════════════════════════════════════ */

function UpdateBanner() {
  const [status, setStatus] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanupStatus = api.onUpdateStatus((s) => setStatus(s));
    const cleanupInfo = api.onUpdateInfo((info) => setVersion(info.version));
    const cleanupProgress = api.onUpdateProgress((p) => setProgress(p.percent));

    return () => {
      cleanupStatus();
      cleanupInfo();
      cleanupProgress();
    };
  }, []);

  if (dismissed || !status || status === 'up-to-date' || status === 'checking' || status === 'error') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800 border-t border-emerald-500/30 px-4 py-2">
      <div className="flex items-center gap-2 text-xs">
        {status === 'available' && (
          <>
            <Download className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span className="text-emerald-300">
              Mise à jour v{version} en cours de téléchargement...
            </span>
            {progress > 0 && (
              <span className="text-slate-400 ml-auto">{progress}%</span>
            )}
          </>
        )}
        {status === 'downloaded' && (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-300">
              v{version} prête !
            </span>
            <button
              onClick={() => window.electronAPI?.installUpdate()}
              className="ml-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
            >
              Redémarrer
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              Plus tard
            </button>
          </>
        )}
      </div>

      {/* Progress bar */}
      {status === 'available' && progress > 0 && (
        <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════ */

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [radioMode, setRadioMode] = useState<RadioMode>('pilot');
  const [accessToken, setAccessToken] = useState<string>('');

  if (screen === 'login' || !profile) {
    return (
      <>
        <LoginScreen
          onLogin={(p, mode, token) => {
            setProfile(p);
            setRadioMode(mode);
            setAccessToken(token);
            localStorage.setItem('vhf-radio-mode', mode);
            setScreen('radio');
          }}
        />
        <UpdateBanner />
      </>
    );
  }

  if (screen === 'admin') {
    return (
      <>
        <AdminFreqs onBack={() => setScreen('radio')} accessToken={accessToken} />
        <UpdateBanner />
      </>
    );
  }

  return (
    <>
      <RadioScreen
        profile={profile}
        initialMode={radioMode}
        accessToken={accessToken}
        onLogout={() => {
          setProfile(null);
          setAccessToken('');
          localStorage.removeItem('vhf-radio-mode');
          setScreen('login');
        }}
        onAdmin={() => setScreen('admin')}
      />
      <UpdateBanner />
    </>
  );
}
