/**
 * Aéroports PTFS (Pilot Training Flight Simulator) avec codes OACI.
 * Source: ATC24 Interactive Chart - mise à jour 2024
 */

export type TailleAeroport = 'international' | 'regional' | 'small' | 'military';

export interface AeroportPTFS {
  code: string;
  nom: string;
  taille: TailleAeroport;
  tourisme: boolean;
  passagersMax: number;
  vor?: string; // Code VOR si disponible
  freq?: string; // Fréquence VOR
}

export const AEROPORTS_PTFS: readonly AeroportPTFS[] = [
  // Aéroports internationaux
  { code: 'ITKO', nom: 'Tokyo Haneda Intl.', taille: 'international', tourisme: true, passagersMax: 25000, vor: 'HME', freq: '112.20' },
  { code: 'IPPH', nom: 'Perth Intl.', taille: 'international', tourisme: true, passagersMax: 18000, vor: 'PER', freq: '115.430' },
  { code: 'ILAR', nom: 'Larnaca Intl.', taille: 'international', tourisme: true, passagersMax: 15000, vor: 'LCK', freq: '112.90' },
  { code: 'IPAP', nom: 'Paphos Intl.', taille: 'international', tourisme: true, passagersMax: 12000, vor: 'PFO', freq: '117.95' },
  { code: 'IRFD', nom: 'Greater Rockford Intl.', taille: 'international', tourisme: false, passagersMax: 12000, vor: 'RFD', freq: '113.55' },
  { code: 'IMLR', nom: 'Mellor Intl.', taille: 'international', tourisme: false, passagersMax: 15000, vor: 'MLR', freq: '114.75' },
  { code: 'IZOL', nom: 'Izolirani Intl.', taille: 'international', tourisme: false, passagersMax: 10000, vor: 'IZO', freq: '117.530' },
  
  // Aéroports régionaux
  { code: 'ISAU', nom: 'Sauthemptona Airport', taille: 'regional', tourisme: false, passagersMax: 8000, vor: 'SAU', freq: '115.35' },
  { code: 'IJAF', nom: 'Al Najaf Intl.', taille: 'regional', tourisme: false, passagersMax: 5000, vor: 'NJF', freq: '112.45' },
  { code: 'IBLT', nom: 'Boltic Airfield', taille: 'regional', tourisme: false, passagersMax: 3000 },
  { code: 'OOWO', nom: 'Queen Blades Airport', taille: 'regional', tourisme: false, passagersMax: 4000, vor: 'BLA', freq: '117.45' },
  { code: 'ICTAM', nom: 'ICTAM Airport', taille: 'regional', tourisme: false, passagersMax: 3500 },
  
  // Petits aéroports
  { code: 'IDCS', nom: 'Saba Airport', taille: 'small', tourisme: true, passagersMax: 800 },
  { code: 'IGRV', nom: 'Grindavik Airport', taille: 'small', tourisme: true, passagersMax: 2000, vor: 'GVK', freq: '112.320' },
  { code: 'IBTH', nom: 'Saint Barthelemy', taille: 'small', tourisme: true, passagersMax: 4000 },
  { code: 'ISKP', nom: 'Skopelos Airfield', taille: 'small', tourisme: true, passagersMax: 3000 },
  { code: 'ILKL', nom: 'Lukla Airport', taille: 'small', tourisme: true, passagersMax: 500 },
  { code: 'IBAR', nom: 'Barra Airport', taille: 'small', tourisme: true, passagersMax: 2000 },
  { code: 'IHEN', nom: 'Henstridge Airfield', taille: 'small', tourisme: false, passagersMax: 1500 },
  { code: 'ITRN', nom: 'Training Centre', taille: 'small', tourisme: false, passagersMax: 1000, vor: 'TRN', freq: '113.10' },
  { code: 'KROTEN', nom: 'Kroten Airport', taille: 'small', tourisme: false, passagersMax: 1500, vor: 'KRT' },
  { code: 'BARNIE', nom: 'Barnie Airfield', taille: 'small', tourisme: false, passagersMax: 800, vor: 'BAR' },
  { code: 'GOLDEN', nom: 'Golden Airport', taille: 'small', tourisme: false, passagersMax: 1000, vor: 'GOL' },
  { code: 'OTVO', nom: 'Otvo Airfield', taille: 'small', tourisme: false, passagersMax: 600 },
  { code: 'DETOX', nom: 'Detox Airport', taille: 'small', tourisme: false, passagersMax: 1200, vor: 'DET' },
  { code: 'HOTDOG', nom: 'Hotdog Airfield', taille: 'small', tourisme: false, passagersMax: 800, vor: 'HOT' },
  { code: 'ORANGE', nom: 'Orange Airport', taille: 'small', tourisme: true, passagersMax: 2500, vor: 'ORG' },
  { code: 'SHV', nom: 'Sea Haven', taille: 'small', tourisme: true, passagersMax: 1500 },
  
  // Bases militaires
  { code: 'IIAB', nom: 'McConnell AFB', taille: 'military', tourisme: false, passagersMax: 3000 },
  { code: 'IGAR', nom: 'Air Base Garry', taille: 'military', tourisme: false, passagersMax: 2000, vor: 'GRY', freq: '111.90' },
  { code: 'ISCM', nom: 'RAF Scampton', taille: 'military', tourisme: false, passagersMax: 2000 },
  { code: 'HUNTER', nom: 'Hunter AFB', taille: 'military', tourisme: false, passagersMax: 1500, vor: 'HUT' },
] as const;

// Waypoints/VOR/DME du réseau PTFS
export interface Waypoint {
  code: string;
  type: 'VOR' | 'DME' | 'NDB' | 'FIX';
  freq?: string;
}

export const WAYPOINTS_PTFS: readonly Waypoint[] = [
  // VOR/DME avec fréquences
  { code: 'HME', type: 'VOR', freq: '112.20' },
  { code: 'PER', type: 'VOR', freq: '115.430' },
  { code: 'GVK', type: 'VOR', freq: '112.320' },
  { code: 'SAU', type: 'VOR', freq: '115.35' },
  { code: 'MLR', type: 'VOR', freq: '114.75' },
  { code: 'RFD', type: 'VOR', freq: '113.55' },
  { code: 'BLA', type: 'VOR', freq: '117.45' },
  { code: 'TRN', type: 'VOR', freq: '113.10' },
  { code: 'LCK', type: 'VOR', freq: '112.90' },
  { code: 'PFO', type: 'VOR', freq: '117.95' },
  { code: 'NJF', type: 'VOR', freq: '112.45' },
  { code: 'IZO', type: 'VOR', freq: '117.530' },
  { code: 'GRY', type: 'VOR', freq: '111.90' },
  
  // Fixes/Waypoints de navigation
  { code: 'SHELL', type: 'FIX' },
  { code: 'SHIBA', type: 'FIX' },
  { code: 'NIKON', type: 'FIX' },
  { code: 'ASTRO', type: 'FIX' },
  { code: 'LETSE', type: 'FIX' },
  { code: 'HONDA', type: 'FIX' },
  { code: 'CHILY', type: 'FIX' },
  { code: 'CRAZY', type: 'FIX' },
  { code: 'WOTAN', type: 'FIX' },
  { code: 'WELLS', type: 'FIX' },
  { code: 'SQUID', type: 'FIX' },
  { code: 'ZESTA', type: 'FIX' },
  { code: 'GULEG', type: 'FIX' },
  { code: 'PIPER', type: 'FIX' },
  { code: 'ONDER', type: 'FIX' },
  { code: 'KNIFE', type: 'FIX' },
  { code: 'TINDR', type: 'FIX' },
  { code: 'FROOT', type: 'FIX' },
  { code: 'EURAD', type: 'FIX' },
  { code: 'TUDEP', type: 'FIX' },
  { code: 'ALLRY', type: 'FIX' },
  { code: 'STRAX', type: 'FIX' },
  { code: 'KELLA', type: 'FIX' },
  { code: 'BOBOS', type: 'FIX' },
  { code: 'BLANK', type: 'FIX' },
  { code: 'GERLD', type: 'FIX' },
  { code: 'RENDR', type: 'FIX' },
  { code: 'JOOPY', type: 'FIX' },
  { code: 'NOONU', type: 'FIX' },
  { code: 'UDMUG', type: 'FIX' },
  { code: 'THENR', type: 'FIX' },
  { code: 'ACRES', type: 'FIX' },
  { code: 'YOUTH', type: 'FIX' },
  { code: 'PROBE', type: 'FIX' },
  { code: 'DINER', type: 'FIX' },
  { code: 'SISTA', type: 'FIX' },
  { code: 'TALIS', type: 'FIX' },
  { code: 'ROSMO', type: 'FIX' },
  { code: 'LLIME', type: 'FIX' },
  { code: 'UWAIS', type: 'FIX' },
  { code: 'HAWKIN', type: 'FIX' },
  { code: 'EZYDB', type: 'FIX' },
  { code: 'RESURGE', type: 'FIX' },
  { code: 'WELSH', type: 'FIX' },
  { code: 'CAMEL', type: 'FIX' },
  { code: 'DUNKS', type: 'FIX' },
  { code: 'MORRD', type: 'FIX' },
  { code: 'FRANK', type: 'FIX' },
  { code: 'ENDER', type: 'FIX' },
  { code: 'INDEX', type: 'FIX' },
  { code: 'GAVIN', type: 'FIX' },
  { code: 'SILVA', type: 'FIX' },
  { code: 'CYRIL', type: 'FIX' },
  { code: 'TRESIN', type: 'FIX' },
  { code: 'DIZZIER', type: 'FIX' },
  { code: 'ABSRS', type: 'FIX' },
  { code: 'CELAR', type: 'FIX' },
  { code: 'SUNST', type: 'FIX' },
  { code: 'BUCFA', type: 'FIX' },
  { code: 'KUNAV', type: 'FIX' },
  { code: 'SETHR', type: 'FIX' },
  { code: 'OCEEN', type: 'FIX' },
  { code: 'CAWZE', type: 'FIX' },
  { code: 'DELIVERY', type: 'FIX' },
  { code: 'DOGGO', type: 'FIX' },
  { code: 'BILLO', type: 'FIX' },
  { code: 'THACC', type: 'FIX' },
  { code: 'SHREK', type: 'FIX' },
  { code: 'SPACE', type: 'FIX' },
  { code: 'SAWPE', type: 'FIX' },
  { code: 'HAWFA', type: 'FIX' },
  { code: 'CLEARANCE', type: 'FIX' },
  { code: 'JUSTY', type: 'FIX' },
  { code: 'CHAIN', type: 'FIX' },
  { code: 'HACKE', type: 'FIX' },
  { code: 'BEANS', type: 'FIX' },
  { code: 'LOGAN', type: 'FIX' },
  { code: 'ATPEV', type: 'FIX' },
  { code: 'LAVNO', type: 'FIX' },
  { code: 'ANYMS', type: 'FIX' },
  { code: 'RENTS', type: 'FIX' },
  { code: 'GEORG', type: 'FIX' },
  { code: 'SEEKS', type: 'FIX' },
  { code: 'EXMOR', type: 'FIX' },
  { code: 'JAMSI', type: 'FIX' },
  { code: 'GRASS', type: 'FIX' },
  { code: 'KINDLE', type: 'FIX' },
  { code: 'JACKI', type: 'FIX' },
  { code: 'DEBUG', type: 'FIX' },
  { code: 'HECKS', type: 'FIX' },
  { code: 'PACKT', type: 'FIX' },
  { code: 'ALDER', type: 'FIX' },
  { code: 'STACK', type: 'FIX' },
  { code: 'PEPUL', type: 'FIX' },
  { code: 'GODLU', type: 'FIX' },
  { code: 'LAZER', type: 'FIX' },
  { code: 'BOBUX', type: 'FIX' },
  { code: 'NUBER', type: 'FIX' },
  { code: 'WASTE', type: 'FIX' },
  { code: 'HOGGS', type: 'FIX' },
  { code: 'EMJAY', type: 'FIX' },
  { code: 'ODOKU', type: 'FIX' },
  { code: 'CANDLE', type: 'FIX' },
  { code: 'AQWRT', type: 'FIX' },
  { code: 'FORIA', type: 'FIX' },
  { code: 'MUONE', type: 'FIX' },
  { code: 'JAZZR', type: 'FIX' },
  { code: 'TRELN', type: 'FIX' },
  { code: 'REAPR', type: 'FIX' },
  { code: 'DIRECTOR', type: 'FIX' },
  { code: 'WAGON', type: 'FIX' },
] as const;

// Espaces aériens (FIR/TMA)
export interface EspaceAerien {
  code: string;
  nom: string;
  type: 'FIR' | 'TMA' | 'CTR';
}

export const ESPACES_AERIENS: readonly EspaceAerien[] = [
  { code: 'GRINDAVIK', nom: 'Grindavik FIR', type: 'FIR' },
  { code: 'BARTHELEMY', nom: 'Barthelemy FIR', type: 'FIR' },
  { code: 'ROCKFORD', nom: 'Rockford FIR', type: 'FIR' },
  { code: 'SAUTHEMPTONA', nom: 'Sauthemptona FIR', type: 'FIR' },
  { code: 'LARNACA', nom: 'Larnaca FIR', type: 'FIR' },
  { code: 'PERTH', nom: 'Perth FIR', type: 'FIR' },
  { code: 'IZOLIRANI', nom: 'Izolirani FIR', type: 'FIR' },
  { code: 'SKOPELOS', nom: 'Skopelos TMA', type: 'TMA' },
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
