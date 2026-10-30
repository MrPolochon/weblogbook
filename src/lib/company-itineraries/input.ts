import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { FlightSubmissionError } from '@/lib/plans-vol/submission';

export const itineraryUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function itineraryInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 20_000) throw new FlightSubmissionError('Itinéraire invalide.');
  const body = value as Record<string, unknown>;
  if (!itineraryUuid.test(String(body.request_id || '')) || !itineraryUuid.test(String(body.compagnie_avion_id || ''))) throw new FlightSubmissionError('Identifiant de requête ou d’appareil invalide.');
  const origin = String(body.aeroport_depart || '').trim().toUpperCase();
  const number = String(body.numero_vol || '').trim().toUpperCase();
  const nature = body.nature_transport || 'passagers';
  if (!CODES_OACI_VALIDES.has(origin) || !number || number.length > 24 || !['passagers', 'cargo'].includes(String(nature))) throw new FlightSubmissionError('Départ, numéro de vol ou transport invalide.');
  if (!Array.isArray(body.segments) || body.segments.length < 2 || body.segments.length > 5) throw new FlightSubmissionError('Prévoyez entre 2 et 5 tronçons.');
  let previous = origin;
  const segments = body.segments.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new FlightSubmissionError(`Tronçon ${index + 1} invalide.`);
    const leg = raw as Record<string, unknown>;
    const destination = String(leg.aeroport_arrivee || '').trim().toUpperCase();
    const minutes = Number(leg.temps_prev_min);
    if (!CODES_OACI_VALIDES.has(destination) || destination === previous || (leg.aeroport_depart && String(leg.aeroport_depart).toUpperCase() !== previous)) throw new FlightSubmissionError(`Tronçon ${index + 1} : départ et arrivée doivent former un itinéraire continu.`);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || !['IFR', 'VFR'].includes(String(leg.type_vol || 'IFR'))) throw new FlightSubmissionError(`Tronçon ${index + 1} : durée ou type de vol invalide.`);
    previous = destination;
    const preparation: Record<string, unknown> = { aeroport_arrivee: destination, temps_prev_min: minutes, type_vol: leg.type_vol || 'IFR' };
    // Do not persist client demand, money, status, crew or aircraft fields.
    for (const key of ['heure_depart', 'intentions_vol', 'sid_depart', 'star_arrivee', 'route_ifr', 'niveau_croisiere', 'porte', 'note_atc']) {
      if (typeof leg[key] === 'string') preparation[key] = leg[key].trim().slice(0, 2000);
    }
    return preparation;
  });
  return { request_id: String(body.request_id).toLowerCase(), compagnie_avion_id: String(body.compagnie_avion_id).toLowerCase(), numero_vol: number, aeroport_depart: origin, nature_transport: nature, segments };
}
