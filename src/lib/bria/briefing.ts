export type BriaDraft = {
  mode?: string;
  departure?: string;
  arrival?: string;
  callsign?: string;
  aircraft?: string;
  registration?: string;
  company?: string;
  departureUtc?: string;
  durationMinutes?: string | number;
  flightRules?: string;
  intentions?: string;
  sid?: string;
  star?: string;
  route?: string;
};

/** A read-only review of the form. It never generates or submits a flight plan. */
export function buildBriaBriefing(draft: BriaDraft = {}) {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const duration = Number(draft.durationMinutes);
  const missing: string[] = [];
  if (!text(draft.aircraft)) missing.push('Choisir votre appareil.');
  if (!text(draft.departure)) missing.push('Choisir l’aéroport de départ.');
  if (!text(draft.arrival)) missing.push('Choisir l’aéroport d’arrivée.');
  if (!text(draft.callsign)) missing.push('Renseigner votre indicatif.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text(draft.departureUtc))) missing.push('Renseigner une heure de départ UTC valide.');
  if (!Number.isInteger(duration) || duration < 1) missing.push('Renseigner la durée prévue en minutes.');
  const rules = text(draft.flightRules).toUpperCase();
  if (rules === 'IFR') {
    if (!text(draft.sid)) missing.push('Choisir une SID ou l’option sans SID.');
    if (!text(draft.star)) missing.push('Choisir une STAR ou l’option sans STAR.');
  } else if (rules === 'VFR') {
    if (!text(draft.intentions)) missing.push('Décrire vos intentions de vol VFR.');
  } else missing.push('Choisir les règles de vol VFR ou IFR.');

  const lines = [
    `Route : ${text(draft.departure) || 'départ à choisir'} → ${text(draft.arrival) || 'arrivée à choisir'}.`,
    `Indicatif : ${text(draft.callsign) || 'à renseigner'}.`,
    `Appareil : ${text(draft.aircraft) || 'à choisir'}${text(draft.registration) ? ` · ${text(draft.registration)}` : ''}.`,
    ...(text(draft.company) ? [`Compagnie : ${text(draft.company)}.`] : []),
    `Départ prévu : ${text(draft.departureUtc) || 'à renseigner'} UTC.`,
    `Durée prévue : ${Number.isInteger(duration) && duration > 0 ? `${duration} minutes` : 'à renseigner'}.`,
    `Règles de vol : ${rules || 'à choisir'}.`,
    ...(rules === 'IFR' ? [`SID : ${text(draft.sid) || 'à choisir'} · STAR : ${text(draft.star) || 'à choisir'}.`, ...(text(draft.route) ? [`Route IFR : ${text(draft.route)}.`] : [])] : []),
    ...(rules === 'VFR' && text(draft.intentions) ? [`Intentions : ${text(draft.intentions)}.`] : []),
  ];
  const advice = [
    'Consultez les NOTAM, la météo et les performances de votre appareil avant le départ.',
    'Vérifiez l’horaire UTC, les procédures choisies et les instructions des contrôleurs.',
    'Relisez le récapitulatif final : le dépôt et les contrôles du serveur restent à effectuer dans le formulaire.',
  ];
  return {
    lines,
    missing,
    advice,
    speechText: ['Briefing de préparation du vol.', ...lines, ...(missing.length ? ['À compléter.', ...missing] : []), ...advice].join(' '),
  };
}
