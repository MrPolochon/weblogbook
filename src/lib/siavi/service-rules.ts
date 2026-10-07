export const AEROPORTS_SIAVI_EXCLUSIFS = new Set(['IBTH', 'IJAF', 'IBAR', 'IHEN', 'IDCS', 'ILKL', 'ISCM']);
export function afisAvailable(aeroport: string, atcAirports: string[]) {
  return AEROPORTS_SIAVI_EXCLUSIFS.has(aeroport) || !atcAirports.includes(aeroport);
}
export function planAtAirport(plan: { aeroport_depart: string; aeroport_arrivee: string }, airport: string) {
  return plan.aeroport_depart === airport || plan.aeroport_arrivee === airport;
}
