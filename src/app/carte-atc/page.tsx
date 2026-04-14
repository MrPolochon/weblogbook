import AtcMapClient from './AtcMapClient';

export const metadata = {
  title: 'Carte œil du web (ODW) — Mixou Airlines PTFS',
  description: 'Visualisez en temps réel les contrôleurs aériens en service sur la carte PTFS.',
};

export default function CarteAtcPage() {
  return <AtcMapClient />;
}
