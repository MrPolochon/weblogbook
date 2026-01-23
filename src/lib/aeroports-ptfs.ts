/**
 * Aéroports PTFS (Pilot Training Flight Simulator) avec codes OACI.
 * Source: https://ptfs.app/charts — liste officielle.
 */

export type TailleAeroport = 'international' | 'regional' | 'small' | 'military';

export interface AeroportPTFS {
  code: string;
  nom: string;
  taille: TailleAeroport;
  tourisme: boolean;
  passagersMax: number; // Capacité max de passagers dans l'aéroport
}

export const AEROPORTS_PTFS: readonly AeroportPTFS[] = [
  { code: 'IBAR', nom: 'Barra Airport', taille: 'small', tourisme: true, passagersMax: 2000 },
  { code: 'IHEN', nom: 'Henstridge Airfield', taille: 'small', tourisme: false, passagersMax: 1500 },
  { code: 'ILAR', nom: 'Larnaca Intl.', taille: 'international', tourisme: true, passagersMax: 15000 },
  { code: 'IIAB', nom: 'McConnell AFB', taille: 'military', tourisme: false, passagersMax: 3000 },
  { code: 'IPAP', nom: 'Paphos Intl.', taille: 'international', tourisme: true, passagersMax: 12000 },
  { code: 'IGRV', nom: 'Grindavik Airport', taille: 'small', tourisme: true, passagersMax: 2000 },
  { code: 'IJAF', nom: 'Al Najaf', taille: 'regional', tourisme: false, passagersMax: 5000 },
  { code: 'IZOL', nom: 'Izolirani Intl.', taille: 'international', tourisme: false, passagersMax: 10000 },
  { code: 'ISCM', nom: 'RAF Scampton', taille: 'military', tourisme: false, passagersMax: 2000 },
  { code: 'IBRD', nom: 'Bird Island Airfield', taille: 'small', tourisme: true, passagersMax: 1000 },
  { code: 'IDCS', nom: 'Saba Airport', taille: 'small', tourisme: true, passagersMax: 800 },
  { code: 'ITKO', nom: 'Tokyo Intl.', taille: 'international', tourisme: true, passagersMax: 25000 },
  { code: 'ILKL', nom: 'Lukla Airport', taille: 'small', tourisme: true, passagersMax: 500 },
  { code: 'IPPH', nom: 'Perth Intl.', taille: 'international', tourisme: true, passagersMax: 18000 },
  { code: 'IGAR', nom: 'Air Base Garry', taille: 'military', tourisme: false, passagersMax: 2000 },
  { code: 'IBLT', nom: 'Boltic Airfield', taille: 'regional', tourisme: false, passagersMax: 3000 },
  { code: 'IRFD', nom: 'Greater Rockford', taille: 'international', tourisme: false, passagersMax: 12000 },
  { code: 'IMLR', nom: 'Mellor Intl.', taille: 'international', tourisme: false, passagersMax: 15000 },
  { code: 'ITRC', nom: 'Training Centre', taille: 'small', tourisme: false, passagersMax: 1000 },
  { code: 'IBTH', nom: 'Saint Barthelemy', taille: 'small', tourisme: true, passagersMax: 4000 },
  { code: 'IUFO', nom: 'UFO Base', taille: 'small', tourisme: false, passagersMax: 500 },
  { code: 'ISAU', nom: 'Sauthamptona Airport', taille: 'regional', tourisme: false, passagersMax: 8000 },
  { code: 'ISKP', nom: 'Skopelos Airfield', taille: 'small', tourisme: true, passagersMax: 3000 },
] as const;

export const CODES_OACI_VALIDES: Set<string> = new Set(AEROPORTS_PTFS.map((a) => a.code));

export function getAeroportLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const a = AEROPORTS_PTFS.find((x) => x.code === code);
  return a ? `${a.code} – ${a.nom}` : code;
}

export function getAeroportNom(code: string | null | undefined): string {
  if (!code) return '—';
  const a = AEROPORTS_PTFS.find((x) => x.code === code);
  return a ? a.nom : code;
}

export function getAeroportInfo(code: string | null | undefined): AeroportPTFS | null {
  if (!code) return null;
  return AEROPORTS_PTFS.find((x) => x.code === code) || null;
}

// Coefficients d'impact du prix selon la taille de l'aéroport
// Plus le coefficient est élevé, moins le prix affecte le remplissage
export const COEFFICIENTS_PRIX: Record<TailleAeroport, number> = {
  international: 0.6,  // Prix a moins d'impact (beaucoup de monde)
  regional: 0.8,       // Impact moyen
  small: 1.0,          // Impact normal
  military: 0.3,       // Peu de passagers civils
};

// Bonus de remplissage pour les destinations touristiques
export const BONUS_TOURISME = 1.15; // +15% de remplissage potentiel

// Prix optimal de référence (au-dessus = moins de passagers, en-dessous = plus)
export const PRIX_OPTIMAL_PAX = 100; // F$ par passager

/**
 * Calcule le coefficient de remplissage basé sur le prix et les caractéristiques des aéroports
 * @returns Un nombre entre 0.2 et 1.3 représentant le multiplicateur de remplissage
 */
export function calculerCoefficientRemplissage(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number
): number {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return 1.0; // Par défaut
  }

  // Moyenne des coefficients de prix des deux aéroports
  const coefPrixDepart = COEFFICIENTS_PRIX[aeroportDepart.taille];
  const coefPrixArrivee = COEFFICIENTS_PRIX[aeroportArrivee.taille];
  const coefPrixMoyen = (coefPrixDepart + coefPrixArrivee) / 2;

  // Impact du prix : plus le prix est élevé par rapport à l'optimal, moins de passagers
  // Formula: 1 - (coefPrix * (prixBillet - PRIX_OPTIMAL) / PRIX_OPTIMAL * 0.5)
  let impactPrix = 1.0;
  if (prixBillet > PRIX_OPTIMAL_PAX) {
    // Prix au-dessus de l'optimal : pénalité
    const ratio = (prixBillet - PRIX_OPTIMAL_PAX) / PRIX_OPTIMAL_PAX;
    impactPrix = Math.max(0.3, 1 - (ratio * coefPrixMoyen * 0.5));
  } else if (prixBillet < PRIX_OPTIMAL_PAX) {
    // Prix en-dessous de l'optimal : petit bonus
    const ratio = (PRIX_OPTIMAL_PAX - prixBillet) / PRIX_OPTIMAL_PAX;
    impactPrix = Math.min(1.2, 1 + (ratio * 0.2));
  }

  // Bonus tourisme sur la destination
  let coefficient = impactPrix;
  if (aeroportArrivee.tourisme) {
    coefficient *= BONUS_TOURISME;
  }

  // Limiter entre 0.2 et 1.3
  return Math.max(0.2, Math.min(1.3, coefficient));
}
