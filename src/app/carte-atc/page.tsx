import AtcMapClient from './AtcMapClient';

export const metadata = {
  title: 'PFtesterODW — Mixou Airlines',
  description: 'Test public de tracking d’avions sur le serveur Project Flight Mixou Airlines.',
};

export default function CarteAtcPage() {
  return <AtcMapClient />;
}
