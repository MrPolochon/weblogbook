import AtcMapClient from './AtcMapClient';

export const metadata = {
  title: 'ODW PTFS — Mixou Airlines',
  description: 'Carte œil du web des vols PTFS de Mixou Airlines.',
};

export default function CarteAtcPage() {
  return <AtcMapClient />;
}
