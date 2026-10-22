export const MEDEVAC_HOSPITALS: Record<string, string> = {
  IRFD: 'Centre hospitalier de Rockford',
  IPPH: 'Centre hospitalier de Perth',
  IPAP: 'Centre hospitalier de Paphos',
  ISCM: 'Centre hospitalier militaire et civil de Scampton',
  IMLR: 'Centre hospitalier de Mellor',
  ITKO: 'Centre hospitalier de Tokyo',
};

export type MedevacMissionType = 'evacuation' | 'service';
type Leg = { aeroport_depart: string; aeroport_arrivee: string };

export function medevacRoutingError(type: MedevacMissionType, legs: Leg[], bases: string[]): string | null {
  if (!legs.length) return 'Ajoutez au moins un trajet.';
  const baseSet = new Set(bases);
  if (type === 'service' && !baseSet.has(legs[0].aeroport_depart) && !MEDEVAC_HOSPITALS[legs[0].aeroport_depart]) return 'Hors évacuation, partez d’une base MEDEVAC ; depuis un hôpital, seul le retour vers une base est autorisé.';
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg.aeroport_depart || !leg.aeroport_arrivee) return `Trajet ${i + 1} : départ et destination requis.`;
    if (i > 0 && leg.aeroport_depart !== legs[i - 1].aeroport_arrivee) return `Trajet ${i + 1} : le départ doit reprendre la destination précédente.`;
    if (type === 'service' && !baseSet.has(leg.aeroport_arrivee)) return `Trajet ${i + 1} : hors évacuation sanitaire, l’arrivée doit être une base MEDEVAC achetée. Depuis un hôpital, prévoyez un retour à une base.`;
    if (type === 'evacuation' && leg.aeroport_depart === leg.aeroport_arrivee) return `Trajet ${i + 1} : pour une reconnaissance avec retour au même terrain, choisissez « Vol de service SIAVI ».`;
    if (leg.aeroport_depart === leg.aeroport_arrivee && !baseSet.has(leg.aeroport_depart)) return `Trajet ${i + 1} : une boucle locale doit partir et revenir à une base MEDEVAC.`;
  }
  const end = legs[legs.length - 1].aeroport_arrivee;
  if (type === 'evacuation' && !baseSet.has(end) && !MEDEVAC_HOSPITALS[end]) return 'Une évacuation doit se terminer à un centre hospitalier ou à une base MEDEVAC. Ajoutez le transport du patient après l’escale de prise en charge.';
  return null;
}
