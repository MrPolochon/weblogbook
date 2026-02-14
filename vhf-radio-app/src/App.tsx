import { useState } from 'react';
import { Radio } from 'lucide-react';
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [radioMode, setRadioMode] = useState<RadioMode>('pilot');
  const [accessToken, setAccessToken] = useState<string>('');

  if (screen === 'login' || !profile) {
    return (
      <LoginScreen
        onLogin={(p, mode, token) => {
          setProfile(p);
          setRadioMode(mode);
          setAccessToken(token);
          localStorage.setItem('vhf-radio-mode', mode);
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
  );
}
