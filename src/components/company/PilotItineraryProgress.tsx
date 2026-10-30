import Link from 'next/link';
import { ArrowRight, Pause, Route } from 'lucide-react';
import styles from './CompanyItineraries.module.css';

export type PilotItinerarySummary = {
  id: string; company_id: string; flight_number: string; origin: string; destination: string;
  status: 'planned' | 'active' | 'paused' | 'diverted'; next_leg_index: number;
  legs: Array<{ id: string; leg_index: number; origin: string; destination: string; status: string; plan_id: string | null }>;
};

export default function PilotItineraryProgress({ itineraries, hasActivePlan }: { itineraries: PilotItinerarySummary[]; hasActivePlan: boolean }) {
  if (!itineraries.length) return null;
  return <section className={styles.itineraries} aria-label="Mes itinéraires commerciaux">
    {itineraries.map(itinerary => {
      const legs = [...itinerary.legs].sort((a, b) => a.leg_index - b.leg_index);
      const next = legs.find(leg => leg.leg_index === itinerary.next_leg_index && leg.status === 'planned');
      const active = legs.find(leg => leg.status === 'active');
      return <article key={itinerary.id} className={styles.card}>
        <div className={styles.legHeading}><h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-100"><Route aria-hidden className="h-5 w-5 text-sky-400" />{itinerary.flight_number} · {itinerary.status === 'paused' ? 'En escale' : itinerary.status === 'diverted' ? 'Parcours dérouté' : 'Itinéraire commercial'}</h2><span className={styles.badge} data-status={itinerary.status}>{itinerary.status === 'paused' && <Pause aria-hidden className="h-3 w-3" />}{legs.filter(leg => leg.status === 'completed').length}/{legs.length} tronçons clôturés</span></div>
        <p className="text-sm text-slate-200">Destination finale : <strong>{itinerary.destination}</strong></p>
        <ol className={styles.preview} aria-label={`Route complète de ${itinerary.flight_number}`}><li className="flex flex-wrap gap-2 text-sm font-mono text-slate-300">{itinerary.origin}{legs.map(leg => <span key={leg.id} className={leg.status === 'completed' ? 'text-emerald-300' : leg.id === next?.id ? 'text-sky-200' : ''}><ArrowRight aria-hidden className="mr-2 inline h-3 w-3" />{leg.destination}</span>)}</li></ol>
        {itinerary.status === 'paused' && next && <p className={styles.hint}>Tronçon précédent clôturé. Reprise à {next.origin} vers {next.destination} : vérifiez le nouveau chargement et les procédures avant le départ.</p>}
        {itinerary.status === 'diverted' && <p className={styles.hint}>Le vol a été dérouté. Annulez les tronçons restants depuis la compagnie pour replanifier depuis l’arrivée réelle.</p>}
        <div className={styles.actions}>{next && ['planned', 'paused'].includes(itinerary.status) && !hasActivePlan && <Link href={`/logbook/depot-plan-vol?itinerary=${encodeURIComponent(itinerary.id)}`} className={styles.primary}>Préparer le tronçon {next.leg_index} · {next.origin} → {next.destination}</Link>}{active?.plan_id && <Link href={`/logbook/plans-vol/${active.plan_id}`} className={styles.primary}>Suivre le tronçon en cours</Link>}<Link href={`/ma-compagnie?c=${encodeURIComponent(itinerary.company_id)}#services`} className={styles.secondary}>Consulter le parcours de la compagnie</Link></div>
      </article>;
    })}
  </section>;
}
