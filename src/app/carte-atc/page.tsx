import AtcMapClient from './AtcMapClient';
import { RADAR_ENABLED } from '@/lib/radar-status';

export const metadata = {
  title: 'PFtesterODW — Mixou Airlines',
  description: 'Test public de tracking d’avions sur le serveur Project Flight Mixou Airlines.',
};

export default function CarteAtcPage() {
  if (!RADAR_ENABLED) return <main className="min-h-dvh flex items-center justify-center p-6"><p>Le radar est temporairement désactivé.</p></main>;
  return <AtcMapClient />;
}
