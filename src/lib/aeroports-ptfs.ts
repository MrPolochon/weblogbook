/**
 * Aéroports PTFS (Pilot Training Flight Simulator) avec codes OACI.
 */

export type TailleAeroport = 'international' | 'regional' | 'small' | 'military';

export interface AeroportPTFS {
  code: string;
  nom: string;
  taille: TailleAeroport;
  tourisme: boolean;
  passagersMax: number;
  cargoMax: number; // Capacité cargo en kg
  industriel: boolean; // Aéroport avec zone industrielle (plus de cargo)
  vor?: string;
  freq?: string;
}

export const AEROPORTS_PTFS: readonly AeroportPTFS[] = [
  // Aéroports internationaux
  { code: 'ITKO', nom: 'Tokyo Intl.', taille: 'international', tourisme: true, passagersMax: 25000, cargoMax: 150000, industriel: true, vor: 'HME', freq: '112.20' },
  { code: 'IPPH', nom: 'Perth Intl.', taille: 'international', tourisme: true, passagersMax: 18000, cargoMax: 120000, industriel: true, vor: 'PER', freq: '115.430' },
  { code: 'ILAR', nom: 'Larnaca Intl.', taille: 'international', tourisme: true, passagersMax: 15000, cargoMax: 80000, industriel: false, vor: 'LCK', freq: '112.90' },
  { code: 'IPAP', nom: 'Paphos Intl.', taille: 'international', tourisme: true, passagersMax: 12000, cargoMax: 50000, industriel: false, vor: 'PFO', freq: '117.95' },
  { code: 'IRFD', nom: 'Greater Rockford', taille: 'international', tourisme: false, passagersMax: 12000, cargoMax: 200000, industriel: true, vor: 'RFD', freq: '113.55' },
  { code: 'IMLR', nom: 'Mellor Intl.', taille: 'international', tourisme: false, passagersMax: 15000, cargoMax: 180000, industriel: true, vor: 'MLR', freq: '114.75' },
  { code: 'IZOL', nom: 'Izolirani Intl.', taille: 'international', tourisme: false, passagersMax: 10000, cargoMax: 100000, industriel: true, vor: 'IZO', freq: '117.530' },
  
  // Aéroports régionaux
  { code: 'ISAU', nom: 'Sauthamptona Airport', taille: 'regional', tourisme: false, passagersMax: 8000, cargoMax: 60000, industriel: true, vor: 'SAU', freq: '115.35' },
  { code: 'IJAF', nom: 'Al Najaf', taille: 'regional', tourisme: false, passagersMax: 5000, cargoMax: 40000, industriel: false, vor: 'NJF', freq: '112.45' },
  { code: 'IBLT', nom: 'Boltic Airfield', taille: 'regional', tourisme: false, passagersMax: 3000, cargoMax: 30000, industriel: false },
  
  // Petits aéroports
  { code: 'IDCS', nom: 'Saba Airport', taille: 'small', tourisme: true, passagersMax: 800, cargoMax: 2000, industriel: false },
  { code: 'IGRV', nom: 'Grindavik Airport', taille: 'small', tourisme: true, passagersMax: 2000, cargoMax: 15000, industriel: false, vor: 'GVK', freq: '112.320' },
  { code: 'IBTH', nom: 'Saint Barthelemy', taille: 'small', tourisme: true, passagersMax: 4000, cargoMax: 8000, industriel: false },
  { code: 'ISKP', nom: 'Skopelos Airfield', taille: 'small', tourisme: true, passagersMax: 3000, cargoMax: 10000, industriel: false },
  { code: 'ILKL', nom: 'Lukla Airport', taille: 'small', tourisme: true, passagersMax: 500, cargoMax: 3000, industriel: false },
  { code: 'IBAR', nom: 'Barra Airport', taille: 'small', tourisme: true, passagersMax: 2000, cargoMax: 5000, industriel: false },
  { code: 'IHEN', nom: 'Henstridge Airfield', taille: 'small', tourisme: false, passagersMax: 1500, cargoMax: 12000, industriel: false },
  { code: 'ITRC', nom: 'Training Centre', taille: 'small', tourisme: false, passagersMax: 1000, cargoMax: 5000, industriel: false, vor: 'TRN', freq: '113.10' },
  { code: 'IBRD', nom: 'Bird Island Airfield', taille: 'small', tourisme: true, passagersMax: 1000, cargoMax: 2000, industriel: false },
  { code: 'IUFO', nom: 'UFO Base', taille: 'small', tourisme: false, passagersMax: 500, cargoMax: 8000, industriel: false },
  
  // Bases militaires (cargo militaire uniquement)
  { code: 'IIAB', nom: 'McConnell AFB', taille: 'military', tourisme: false, passagersMax: 3000, cargoMax: 50000, industriel: false },
  { code: 'IGAR', nom: 'Air Base Garry', taille: 'military', tourisme: false, passagersMax: 2000, cargoMax: 40000, industriel: false, vor: 'GRY', freq: '111.90' },
  { code: 'ISCM', nom: 'RAF Scampton', taille: 'military', tourisme: false, passagersMax: 2000, cargoMax: 35000, industriel: false },
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

// =====================================================
// SYSTÈME DE PRIX DES BILLETS - VERSION STRICTE
// =====================================================

// Prix de référence selon le type de liaison
export const PRIX_REFERENCE: Record<TailleAeroport, number> = {
  international: 120,  // Liaisons internationales : billets plus chers acceptés
  regional: 80,        // Liaisons régionales : prix moyen
  small: 50,           // Petits aéroports : billets pas chers
  military: 30,        // Bases militaires : très peu de civils, prix bas
};

// Prix MAXIMUM absolu - au-delà, PERSONNE n'achète
export const PRIX_MAXIMUM_ABSOLU = 500; // F$ - prix "luxe" maximum

// Prix au-delà duquel le remplissage chute drastiquement
export const PRIX_CRITIQUE: Record<TailleAeroport, number> = {
  international: 300,  // Les riches peuvent payer jusqu'à 300 F$
  regional: 200,       // Maximum 200 F$ pour du régional
  small: 120,          // Maximum 120 F$ pour les petites lignes
  military: 80,        // Très peu de tolérance
};

// Bonus de remplissage pour les destinations touristiques
export const BONUS_TOURISME = 1.10; // +10% de remplissage potentiel

// Malus pour les bases militaires (peu de civils)
export const MALUS_MILITAIRE = 0.3; // Seulement 30% de remplissage max

/**
 * Calcule le coefficient de remplissage basé sur le prix et les caractéristiques des aéroports
 * 
 * RÈGLES STRICTES :
 * - Prix <= référence : 90-100% remplissage
 * - Prix entre référence et critique : décroissance linéaire (100% -> 30%)
 * - Prix entre critique et maximum : décroissance rapide (30% -> 5%)
 * - Prix > maximum absolu : 0% remplissage (personne n'achète)
 * 
 * @returns Un nombre entre 0 et 1.1 représentant le multiplicateur de remplissage
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

  // Utiliser le type d'aéroport le plus restrictif pour le calcul
  const tailleRestrictive = getTailleLaPlusRestrictive(aeroportDepart.taille, aeroportArrivee.taille);
  
  const prixRef = PRIX_REFERENCE[tailleRestrictive];
  const prixCritique = PRIX_CRITIQUE[tailleRestrictive];

  let coefficient = 1.0;

  // RÈGLE 1: Prix au-dessus du MAXIMUM ABSOLU = 0 passagers
  if (prixBillet >= PRIX_MAXIMUM_ABSOLU) {
    return 0;
  }

  // RÈGLE 2: Prix au-dessus du CRITIQUE = très peu de passagers (décroissance rapide)
  if (prixBillet > prixCritique) {
    // De 30% à 5% entre prix critique et maximum absolu
    const ratio = (prixBillet - prixCritique) / (PRIX_MAXIMUM_ABSOLU - prixCritique);
    coefficient = 0.30 - (ratio * 0.25); // De 0.30 à 0.05
    coefficient = Math.max(0.05, coefficient);
  }
  // RÈGLE 3: Prix entre RÉFÉRENCE et CRITIQUE = décroissance linéaire
  else if (prixBillet > prixRef) {
    // De 100% à 30% entre prix référence et critique
    const ratio = (prixBillet - prixRef) / (prixCritique - prixRef);
    coefficient = 1.0 - (ratio * 0.70); // De 1.0 à 0.30
  }
  // RÈGLE 4: Prix en-dessous de la RÉFÉRENCE = bonus léger
  else if (prixBillet < prixRef) {
    // Bonus jusqu'à +10% pour prix très bas
    const ratio = (prixRef - prixBillet) / prixRef;
    coefficient = Math.min(1.10, 1.0 + (ratio * 0.10));
  }

  // BONUS TOURISME : +10% si destination touristique
  if (aeroportArrivee.tourisme && coefficient > 0) {
    coefficient *= BONUS_TOURISME;
  }

  // MALUS MILITAIRE : très peu de civils sur les bases
  if (aeroportDepart.taille === 'military' || aeroportArrivee.taille === 'military') {
    coefficient *= MALUS_MILITAIRE;
  }

  // Limiter entre 0 et 1.15 (max avec tous les bonus)
  return Math.max(0, Math.min(1.15, coefficient));
}

/**
 * Retourne la taille d'aéroport la plus restrictive (la plus petite)
 */
function getTailleLaPlusRestrictive(taille1: TailleAeroport, taille2: TailleAeroport): TailleAeroport {
  const ordre: Record<TailleAeroport, number> = {
    military: 0,
    small: 1,
    regional: 2,
    international: 3,
  };
  return ordre[taille1] <= ordre[taille2] ? taille1 : taille2;
}

/**
 * Calcule le prix optimal recommandé pour une liaison
 */
export function getPrixOptimal(codeDepart: string, codeArrivee: string): { min: number; optimal: number; max: number; critique: number } {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return { min: 30, optimal: 80, max: 200, critique: 300 };
  }

  const tailleRestrictive = getTailleLaPlusRestrictive(aeroportDepart.taille, aeroportArrivee.taille);
  const prixRef = PRIX_REFERENCE[tailleRestrictive];
  const prixCritique = PRIX_CRITIQUE[tailleRestrictive];

  return {
    min: Math.round(prixRef * 0.5),
    optimal: prixRef,
    max: Math.round((prixRef + prixCritique) / 2),
    critique: prixCritique,
  };
}

/**
 * Estime le nombre de passagers pour un vol
 */
export function estimerPassagers(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  capaciteAvion: number,
  passagersDisponibles: number
): { passagers: number; remplissage: number; revenus: number; avertissement: string | null } {
  const coefficient = calculerCoefficientRemplissage(codeDepart, codeArrivee, prixBillet);
  
  // Passagers potentiels = capacité * coefficient
  const passagersPotentiels = Math.floor(capaciteAvion * coefficient);
  
  // Limité par les passagers disponibles à l'aéroport
  const passagers = Math.min(passagersPotentiels, passagersDisponibles);
  
  const remplissage = capaciteAvion > 0 ? passagers / capaciteAvion : 0;
  const revenus = passagers * prixBillet;

  // Avertissements
  let avertissement: string | null = null;
  if (prixBillet >= PRIX_MAXIMUM_ABSOLU) {
    avertissement = '⛔ Prix trop élevé ! Aucun passager ne peut payer ce prix.';
  } else if (coefficient < 0.1) {
    avertissement = '🔴 Prix abusif ! Très peu de passagers accepteront.';
  } else if (coefficient < 0.3) {
    avertissement = '🟠 Prix élevé. Le remplissage sera faible.';
  } else if (coefficient < 0.7) {
    avertissement = '🟡 Prix au-dessus de la moyenne. Remplissage réduit.';
  }

  return { passagers, remplissage, revenus, avertissement };
}
