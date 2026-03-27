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
// FONCTION DE NETTOYAGE DES PRIX (anti-contournement)
// =====================================================
// Empêche les astuces comme "+100000" ou "-50" ou "1e10"

/**
 * Nettoie et valide un prix entré par l'utilisateur
 * Bloque les contournements comme "+100000", "-50", "1e10", etc.
 * 
 * @returns Un nombre positif valide, ou 0 si invalide
 */
export function sanitizePrix(input: string | number): number {
  // Si c'est déjà un nombre, vérifier qu'il est valide
  if (typeof input === 'number') {
    if (!isFinite(input) || isNaN(input) || input < 0) {
      return 0;
    }
    return Math.floor(Math.abs(input));
  }

  // Nettoyer la chaîne : garder seulement les chiffres
  const cleaned = String(input).replace(/[^0-9]/g, '');
  
  // Si vide après nettoyage, retourner 0
  if (!cleaned) {
    return 0;
  }

  // Parser et valider
  const prix = parseInt(cleaned, 10);
  
  // Vérifications de sécurité
  if (!isFinite(prix) || isNaN(prix) || prix < 0) {
    return 0;
  }

  // Limite maximale raisonnable (éviter les overflow)
  const LIMITE_MAX = 1000000; // 1 million F$ max
  return Math.min(prix, LIMITE_MAX);
}

// =====================================================
// SYSTÈME DE PRIX DES BILLETS - VERSION STRICTE V2
// =====================================================
// Les bonus (tourisme, international) ne peuvent PAS contourner les limites de prix !
// Un billet trop cher = avion vide, même sur une ligne touristique internationale.

// Prix de référence selon le type de liaison (prix "normal" attendu)
export const PRIX_REFERENCE: Record<TailleAeroport, number> = {
  international: 150,  // Hub international : clients plus riches
  regional: 100,       // Aéroport régional : classe moyenne
  small: 60,           // Petit aéroport : clients locaux
  military: 40,        // Base militaire : très peu de civils
};

// Prix MAXIMUM absolu - au-delà, PERSONNE n'achète (pas de contournement possible)
export const PRIX_MAXIMUM_ABSOLU = 500; // F$ - même les riches ne paient pas plus

// Prix "critique" - au-delà, le remplissage chute drastiquement
export const PRIX_CRITIQUE: Record<TailleAeroport, number> = {
  international: 350,  // Les VIP peuvent payer jusqu'à 350 F$
  regional: 250,       // Maximum 250 F$ pour du régional
  small: 150,          // Maximum 150 F$ pour les petites lignes
  military: 100,       // Base militaire : très peu de tolérance
};

// Bonus tourisme : SEULEMENT si le prix est raisonnable
export const BONUS_TOURISME_MAX = 1.15; // +15% max de remplissage

// Malus pour les bases militaires (peu de civils, même à bas prix)
export const MALUS_MILITAIRE = 0.25; // Maximum 25% de remplissage civil

/**
 * Calcule le coefficient de remplissage basé sur le prix et les caractéristiques
 * 
 * RÈGLES STRICTES (pas de contournement par les bonus) :
 * 
 * 1. Prix >= 500 F$ → 0% (AUCUN bonus ne peut changer ça)
 * 2. Prix > critique → 5-25% (bonus très réduits)
 * 3. Prix > référence → 25-100% (bonus partiels)
 * 4. Prix <= référence → 100-115% (bonus plein effet)
 * 
 * Les bonus tourisme/international sont PROPORTIONNELS au coefficient de base.
 * Plus le prix est élevé, moins les bonus ont d'effet.
 */
export function calculerCoefficientRemplissage(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number
): number {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return 1.0;
  }

  // ============ SANITIZATION DU PRIX ============
  // Bloque les contournements comme "+100000", "-50", "1e10"
  const prixNettoye = sanitizePrix(prixBillet);

  // ============ RÈGLE ABSOLUE : PRIX MAXIMUM ============
  // Aucun bonus ne peut contourner cette limite !
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU) {
    return 0; // 0 passagers, point final
  }

  // Déterminer les seuils selon le type de liaison
  // On utilise la MOYENNE des deux aéroports (plus juste)
  const prixRefDepart = PRIX_REFERENCE[aeroportDepart.taille];
  const prixRefArrivee = PRIX_REFERENCE[aeroportArrivee.taille];
  const prixRef = (prixRefDepart + prixRefArrivee) / 2;

  const prixCritDepart = PRIX_CRITIQUE[aeroportDepart.taille];
  const prixCritArrivee = PRIX_CRITIQUE[aeroportArrivee.taille];
  const prixCritique = (prixCritDepart + prixCritArrivee) / 2;

  let coefficientBase = 1.0;
  let efficaciteBonus = 1.0; // Les bonus sont réduits si le prix est élevé

  // ============ CALCUL DU COEFFICIENT DE BASE ============
  
  if (prixNettoye > prixCritique) {
    // ZONE CRITIQUE : très peu de passagers (5% à 25%)
    const ratio = (prixNettoye - prixCritique) / (PRIX_MAXIMUM_ABSOLU - prixCritique);
    coefficientBase = 0.25 - (ratio * 0.20); // De 0.25 à 0.05
    coefficientBase = Math.max(0.05, coefficientBase);
    efficaciteBonus = 0.2; // Bonus réduits à 20% de leur valeur
  }
  else if (prixNettoye > prixRef) {
    // ZONE ÉLEVÉE : remplissage moyen (25% à 100%)
    const ratio = (prixNettoye - prixRef) / (prixCritique - prixRef);
    coefficientBase = 1.0 - (ratio * 0.75); // De 1.0 à 0.25
    efficaciteBonus = 1.0 - (ratio * 0.5); // Bonus réduits progressivement (100% -> 50%)
  }
  else if (prixNettoye < prixRef) {
    // ZONE ATTRACTIVE : bon remplissage (100% à 110%)
    const ratio = (prixRef - prixNettoye) / prixRef;
    coefficientBase = Math.min(1.10, 1.0 + (ratio * 0.10));
    efficaciteBonus = 1.0; // Bonus plein effet
  }
  // else : prix = référence → coefficient = 1.0, bonus plein effet

  // ============ APPLICATION DES BONUS/MALUS ============
  
  let coefficient = coefficientBase;

  // BONUS TOURISME (proportionnel à l'efficacité)
  if (aeroportArrivee.tourisme && coefficient > 0) {
    const bonusTourisme = (BONUS_TOURISME_MAX - 1.0) * efficaciteBonus;
    coefficient *= (1.0 + bonusTourisme);
  }

  // MALUS MILITAIRE (toujours appliqué intégralement)
  if (aeroportDepart.taille === 'military' || aeroportArrivee.taille === 'military') {
    coefficient *= MALUS_MILITAIRE;
  }

  // ============ PLAFONNEMENT FINAL ============
  // Maximum 115% même avec tous les bonus
  return Math.max(0, Math.min(1.15, coefficient));
}


/**
 * Calcule le prix optimal recommandé pour une liaison
 * Utilise la MOYENNE des deux aéroports pour être plus juste
 */
export function getPrixOptimal(codeDepart: string, codeArrivee: string): { min: number; optimal: number; max: number; critique: number; maxAbsolu: number } {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return { min: 40, optimal: 100, max: 200, critique: 300, maxAbsolu: PRIX_MAXIMUM_ABSOLU };
  }

  // Moyenne des deux aéroports
  const prixRef = Math.round((PRIX_REFERENCE[aeroportDepart.taille] + PRIX_REFERENCE[aeroportArrivee.taille]) / 2);
  const prixCritique = Math.round((PRIX_CRITIQUE[aeroportDepart.taille] + PRIX_CRITIQUE[aeroportArrivee.taille]) / 2);

  return {
    min: Math.round(prixRef * 0.5),      // Prix très attractif
    optimal: prixRef,                     // Prix recommandé
    max: Math.round((prixRef + prixCritique) / 2), // Prix acceptable
    critique: prixCritique,               // Prix élevé (remplissage faible)
    maxAbsolu: PRIX_MAXIMUM_ABSOLU,       // Au-delà = 0 passagers
  };
}

/**
 * Estime le nombre de passagers pour un vol (pour l'affichage prévisionnel)
 * Retourne une estimation MOYENNE sans aléatoire
 */
export function estimerPassagers(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  capaciteAvion: number,
  passagersDisponibles: number
): { passagers: number; remplissage: number; revenus: number; avertissement: string | null } {
  // Nettoyer le prix (bloque "+100000", "-50", etc.)
  const prixNettoye = sanitizePrix(prixBillet);
  const coefficient = calculerCoefficientRemplissage(codeDepart, codeArrivee, prixNettoye);
  
  // Passagers potentiels = capacité * coefficient (estimation moyenne)
  const passagersPotentiels = Math.floor(capaciteAvion * coefficient);
  
  // Limité par les passagers disponibles à l'aéroport
  const passagers = Math.min(passagersPotentiels, passagersDisponibles);
  
  const remplissage = capaciteAvion > 0 ? passagers / capaciteAvion : 0;
  const revenus = passagers * prixNettoye;

  // Avertissements
  let avertissement: string | null = null;
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU) {
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

/**
 * Calcule le nombre RÉEL de passagers pour un vol (avec aléatoire)
 * À utiliser côté serveur lors de la validation du vol
 * 
 * Le coefficient de remplissage est une PROBABILITÉ MOYENNE.
 * Le résultat réel varie autour de cette moyenne avec ±30% de variation.
 * 
 * Exemples :
 * - Coefficient 80% → résultat entre 56% et 100%
 * - Coefficient 20% → résultat entre 5% et 35% (chance de faire mieux !)
 * - Coefficient 0% (prix >= 500 F$) → toujours 0 (pas de miracle)
 */
export function calculerPassagersReels(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  capaciteAvion: number,
  passagersDisponibles: number
): { passagers: number; remplissage: number; revenus: number; chanceux: boolean } {
  // Nettoyer le prix (bloque "+100000", "-50", etc.)
  const prixNettoye = sanitizePrix(prixBillet);
  const coefficientMoyen = calculerCoefficientRemplissage(codeDepart, codeArrivee, prixNettoye);
  
  // EXCEPTION : Prix >= maximum absolu = TOUJOURS 0 (pas de miracle)
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU) {
    return { passagers: 0, remplissage: 0, revenus: 0, chanceux: false };
  }
  
  // Variation aléatoire : ±30% autour de la moyenne
  // Plus le coefficient est bas, plus la variation peut aider (chance de sauver le vol)
  const variationMax = 0.30;
  const aleatoire = (Math.random() * 2 - 1) * variationMax; // Entre -0.30 et +0.30
  
  // Coefficient final avec variation
  let coefficientReel = coefficientMoyen + aleatoire;
  
  // Bornes : minimum 0, maximum 115%
  coefficientReel = Math.max(0, Math.min(1.15, coefficientReel));
  
  // Si coefficient moyen était très bas mais on a eu de la chance
  const chanceux = aleatoire > 0.15 && coefficientMoyen < 0.5;
  
  // Passagers potentiels avec le coefficient réel
  const passagersPotentiels = Math.floor(capaciteAvion * coefficientReel);
  
  // Limité par les passagers disponibles à l'aéroport
  const passagers = Math.min(passagersPotentiels, passagersDisponibles);
  
  const remplissage = capaciteAvion > 0 ? passagers / capaciteAvion : 0;
  const revenus = passagers * prixNettoye;

  return { passagers, remplissage, revenus, chanceux };
}

// =====================================================
// SYSTÈME DE PRIX DU CARGO - VERSION STRICTE
// =====================================================
// Similaire aux passagers mais avec des bonus différents :
// - BONUS militaire +20% (bases = gros fret militaire)
// - BONUS industriel +25% (zones industrielles = plus de cargo)
// - Pas de bonus tourisme

// =====================================================
// ÉQUILIBRAGE CARGO vs PASSAGERS
// =====================================================
// Objectif : un vol cargo PLEIN doit rapporter ~1.5x à 2x un vol passagers PLEIN
// (le cargo nécessite des avions spécialisés, donc légèrement plus rentable)
//
// Exemple Boeing 777 :
// - Version pax : 350 pax × 150 F$ = 52 500 F$
// - Version cargo : 51 000 kg × ? F$/kg = devrait être ~80 000-100 000 F$
// → Prix cargo optimal ≈ 1.5-2 F$/kg (pas 8 F$/kg !)

// =====================================================
// ÉQUILIBRAGE CARGO RÉVISÉ - Revenus réduits de ~40%
// =====================================================
// Les vols cargo doivent être rentables mais pas excessivement.
// Un 777F plein (~50t) au prix optimal devrait rapporter ~50-60k F$
// (avant c'était ~100k+ ce qui était trop élevé)

// Prix de référence CARGO selon le type d'aéroport (F$ par kg)
export const PRIX_REFERENCE_CARGO: Record<TailleAeroport, number> = {
  international: 1.2,  // Hub cargo : gros volumes, prix bas
  regional: 1,         // Aéroport régional : prix moyen
  small: 0.8,          // Petit aéroport : peu de cargo
  military: 1,         // Base militaire : fret militaire
};

// Prix MAXIMUM absolu CARGO - au-delà, personne n'expédie
export const PRIX_MAXIMUM_ABSOLU_CARGO = 5; // F$/kg max (réduit de 8)

// Prix critique CARGO (au-delà, très peu de cargo)
export const PRIX_CRITIQUE_CARGO: Record<TailleAeroport, number> = {
  international: 3,    // Les entreprises peuvent payer jusqu'à 3 F$/kg max
  regional: 2.5,       // Maximum 2.5 F$/kg pour du régional
  small: 2,            // Maximum 2 F$/kg pour les petites lignes
  military: 3,         // Fret militaire peut être cher
};

// Bonus pour les aéroports militaires (fret militaire, équipement)
export const BONUS_MILITAIRE_CARGO = 1.10; // +10% de chargement (réduit de 20%)

// Bonus pour les zones industrielles
export const BONUS_INDUSTRIEL_CARGO = 1.15; // +15% de chargement (réduit de 25%)

// =====================================================
// TYPES DE CARGAISON
// =====================================================
// Chaque vol cargo a un type de cargaison aléatoire qui affecte :
// - Le coefficient de ponctualité (express/périssables = plus sensibles au retard)
// - Le bonus de revenu (dangereux/surdimensionné = +1% revenu)

export type TypeCargaison = 'general' | 'express' | 'perissable' | 'dangereux' | 'surdimensionne' | 'marchandise_rare';

export interface CargaisonInfo {
  id: TypeCargaison;
  nom: string;
  icon: string;
  color: string;
  // Multiplicateur de pénalité de retard (1.0 = normal, 2.0 = double pénalité)
  sensibiliteRetard: number;
  // Bonus de revenu en pourcentage (0 = pas de bonus, 1 = +1%)
  bonusRevenu: number;
  // Probabilité de base (sera normalisée)
  probabilite: number;
}

export const TYPES_CARGAISON: Record<TypeCargaison, CargaisonInfo> = {
  general: {
    id: 'general',
    nom: 'Marchandises générales',
    icon: '📦',
    color: 'text-slate-400',
    sensibiliteRetard: 1.0,  // Normal
    bonusRevenu: 0,
    probabilite: 80,         // 80% des vols
  },
  express: {
    id: 'express',
    nom: 'Colis express',
    icon: '⚡',
    color: 'text-amber-400',
    sensibiliteRetard: 2.0,  // Double pénalité si retard
    bonusRevenu: 0,
    probabilite: 8,          // 8% des vols
  },
  perissable: {
    id: 'perissable',
    nom: 'Denrées périssables',
    icon: '🧊',
    color: 'text-cyan-400',
    sensibiliteRetard: 2.0,  // Double pénalité si retard
    bonusRevenu: 0,
    probabilite: 7,          // 7% des vols
  },
  dangereux: {
    id: 'dangereux',
    nom: 'Matières dangereuses',
    icon: '☢️',
    color: 'text-red-400',
    sensibiliteRetard: 1.0,  // Normal (pas sensible au temps)
    bonusRevenu: 1,          // +1% bonus revenu
    probabilite: 3,          // 3% des vols (rare)
  },
  surdimensionne: {
    id: 'surdimensionne',
    nom: 'Cargo surdimensionné',
    icon: '🚛',
    color: 'text-purple-400',
    sensibiliteRetard: 1.0,  // Normal (pas sensible au temps)
    bonusRevenu: 1,          // +1% bonus revenu
    probabilite: 2,          // 2% des vols (très rare)
  },
  // Cargo complémentaire sur vols passagers uniquement : 1% chance (voir MARCHANDISES_RARES)
  marchandise_rare: {
    id: 'marchandise_rare',
    nom: 'Marchandise rare',
    icon: '💎',
    color: 'text-amber-300',
    sensibiliteRetard: 1.0,
    bonusRevenu: 30,         // +30% sur la part cargo
    probabilite: 0,          // jamais tiré dans genererTypeCargaison ; utilisé par genererTypeCargaisonComplementaire
  },
};

/** Libellés des marchandises rares (1% sur cargo complémentaire vols passagers) */
export const MARCHANDISES_RARES = [
  'Voiture de luxe',
  'Voiture de collection',
  'Traineau du père Noël du staff',
  'Pièce militaire',
  'Arme militaire',
  'Char militaire',
  'Véhicule militaire',
  'Transfert d\'animaux',
  'Matériel médical',
  'Nourriture exotique',
  'Vaccins',
] as const;

export type MarchandiseRare = (typeof MARCHANDISES_RARES)[number];

/** Retourne une marchandise rare aléatoire (pour affichage ou tirage). */
export function getMarchandiseRareAleatoire(): MarchandiseRare {
  return MARCHANDISES_RARES[Math.floor(Math.random() * MARCHANDISES_RARES.length)];
}

/**
 * Génère aléatoirement un type de cargaison basé sur les probabilités
 * 
 * Répartition :
 * - Marchandises générales : 80%
 * - Colis express : 8%
 * - Denrées périssables : 7%
 * - Matières dangereuses : 3%
 * - Cargo surdimensionné : 2%
 */
export function genererTypeCargaison(): TypeCargaison {
  const types = Object.values(TYPES_CARGAISON);
  const totalProba = types.reduce((sum, t) => sum + t.probabilite, 0);
  
  let random = Math.random() * totalProba;
  
  for (const type of types) {
    random -= type.probabilite;
    if (random <= 0) {
      return type.id;
    }
  }
  
  // Fallback (ne devrait jamais arriver)
  return 'general';
}

/**
 * Génère un type de cargaison pour le cargo complémentaire sur vols passagers.
 * 1 % de chance d'obtenir une marchandise rare (+30 % bonus sur la part cargo).
 */
export function genererTypeCargaisonComplementaire(): TypeCargaison {
  if (Math.random() < 0.01) return 'marchandise_rare';
  return genererTypeCargaison();
}

/**
 * Récupère les informations d'un type de cargaison
 */
export function getCargaisonInfo(type: TypeCargaison): CargaisonInfo {
  return TYPES_CARGAISON[type] || TYPES_CARGAISON.general;
}

/**
 * Calcule le coefficient de chargement cargo basé sur le prix
 * 
 * DIFFÉRENCES avec les passagers :
 * - BONUS +20% pour les vols militaires (au lieu de malus)
 * - BONUS +25% pour les zones industrielles
 * - Pas de bonus tourisme
 */
export function calculerCoefficientChargementCargo(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number
): number {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return 1.0;
  }

  // ============ SANITIZATION DU PRIX ============
  const prixNettoye = sanitizePrix(prixCargo);

  // ============ RÈGLE ABSOLUE : PRIX MAXIMUM ============
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU_CARGO) {
    return 0; // 0 cargo, point final
  }

  // Moyenne des deux aéroports
  const prixRef = (PRIX_REFERENCE_CARGO[aeroportDepart.taille] + PRIX_REFERENCE_CARGO[aeroportArrivee.taille]) / 2;
  const prixCritique = (PRIX_CRITIQUE_CARGO[aeroportDepart.taille] + PRIX_CRITIQUE_CARGO[aeroportArrivee.taille]) / 2;

  let coefficientBase = 1.0;
  let efficaciteBonus = 1.0;

  // ============ CALCUL DU COEFFICIENT DE BASE ============
  
  if (prixNettoye > prixCritique) {
    // ZONE CRITIQUE : très peu de cargo (5% à 25%)
    const ratio = (prixNettoye - prixCritique) / (PRIX_MAXIMUM_ABSOLU_CARGO - prixCritique);
    coefficientBase = 0.25 - (ratio * 0.20);
    coefficientBase = Math.max(0.05, coefficientBase);
    efficaciteBonus = 0.2;
  }
  else if (prixNettoye > prixRef) {
    // ZONE ÉLEVÉE : chargement moyen (25% à 100%)
    const ratio = (prixNettoye - prixRef) / (prixCritique - prixRef);
    coefficientBase = 1.0 - (ratio * 0.75);
    efficaciteBonus = 1.0 - (ratio * 0.5);
  }
  else if (prixNettoye < prixRef) {
    // ZONE ATTRACTIVE : bon chargement (100% à 110%)
    const ratio = (prixRef - prixNettoye) / prixRef;
    coefficientBase = Math.min(1.10, 1.0 + (ratio * 0.10));
    efficaciteBonus = 1.0;
  }

  let coefficient = coefficientBase;

  // ============ BONUS CARGO ============
  // Les bonus servent à FACILITER l'atteinte de 100%, pas à le dépasser !
  // Un bonus de +10% sur un coefficient de 0.7 donne 0.77, pas 1.4

  // BONUS MILITAIRE : +10% pour les vols vers/depuis bases militaires
  if (aeroportDepart.taille === 'military' || aeroportArrivee.taille === 'military') {
    const bonusMilitaire = (BONUS_MILITAIRE_CARGO - 1) * efficaciteBonus; // 0.10
    coefficient = Math.min(1.0, coefficient + bonusMilitaire);
  }

  // BONUS INDUSTRIEL : +15% pour les zones industrielles
  if ((aeroportDepart.industriel || aeroportArrivee.industriel) && coefficient > 0) {
    const bonusIndustriel = (BONUS_INDUSTRIEL_CARGO - 1) * efficaciteBonus; // 0.15
    coefficient = Math.min(1.0, coefficient + bonusIndustriel);
  }

  // ============ PLAFONNEMENT FINAL ============
  // Maximum 100% : on ne peut pas charger plus que la capacité physique !
  return Math.max(0, Math.min(1.0, coefficient));
}

/**
 * Calcule le prix optimal recommandé pour le cargo
 */
export function getPrixOptimalCargo(codeDepart: string, codeArrivee: string): { min: number; optimal: number; max: number; critique: number; maxAbsolu: number } {
  const aeroportDepart = getAeroportInfo(codeDepart);
  const aeroportArrivee = getAeroportInfo(codeArrivee);

  if (!aeroportDepart || !aeroportArrivee) {
    return { min: 1, optimal: 2, max: 3, critique: 5, maxAbsolu: PRIX_MAXIMUM_ABSOLU_CARGO };
  }

  const prixRef = Math.round((PRIX_REFERENCE_CARGO[aeroportDepart.taille] + PRIX_REFERENCE_CARGO[aeroportArrivee.taille]) / 2);
  const prixCritique = Math.round((PRIX_CRITIQUE_CARGO[aeroportDepart.taille] + PRIX_CRITIQUE_CARGO[aeroportArrivee.taille]) / 2);

  return {
    min: Math.max(1, Math.round(prixRef * 0.5)),
    optimal: prixRef,
    max: Math.round((prixRef + prixCritique) / 2),
    critique: prixCritique,
    maxAbsolu: PRIX_MAXIMUM_ABSOLU_CARGO,
  };
}

/**
 * Estime le cargo pour un vol (affichage prévisionnel)
 * IMPORTANT: Le cargo ne peut JAMAIS dépasser la capacité de l'avion !
 */
export function estimerCargo(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number,
  capaciteCargo: number,
  cargoDisponible: number
): { cargo: number; chargement: number; revenus: number; avertissement: string | null } {
  const prixNettoye = sanitizePrix(prixCargo);
  const coefficient = calculerCoefficientChargementCargo(codeDepart, codeArrivee, prixNettoye);
  
  // Le coefficient est un taux de remplissage (max 100% de la capacité)
  // Les bonus ne permettent pas de dépasser la capacité physique !
  const coefficientPlafonne = Math.min(coefficient, 1.0);
  
  const cargoPotentiel = Math.floor(capaciteCargo * coefficientPlafonne);
  
  // Limité par le cargo disponible à l'aéroport ET la capacité de l'avion
  const cargo = Math.min(cargoPotentiel, cargoDisponible, capaciteCargo);
  
  const chargement = capaciteCargo > 0 ? cargo / capaciteCargo : 0;
  const revenus = cargo * prixNettoye;

  let avertissement: string | null = null;
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU_CARGO) {
    avertissement = '⛔ Prix trop élevé ! Personne n\'expédie à ce tarif.';
  } else if (coefficient < 0.1) {
    avertissement = '🔴 Prix abusif ! Très peu de cargo.';
  } else if (coefficient < 0.3) {
    avertissement = '🟠 Prix élevé. Chargement faible.';
  } else if (coefficient < 0.7) {
    avertissement = '🟡 Prix au-dessus de la moyenne.';
  }

  return { cargo, chargement, revenus, avertissement };
}

/**
 * Calcule le cargo RÉEL avec aléatoire (côté serveur)
 * IMPORTANT: Le cargo ne peut JAMAIS dépasser la capacité de l'avion !
 * 
 * Génère également le TYPE DE CARGAISON aléatoirement :
 * - Marchandises générales : 80% (normal)
 * - Colis express : 8% (sensible au retard)
 * - Denrées périssables : 7% (sensible au retard)
 * - Matières dangereuses : 3% (+1% bonus revenu)
 * - Cargo surdimensionné : 2% (+1% bonus revenu)
 */
export function calculerCargoReel(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number,
  capaciteCargo: number,
  cargoDisponible: number
): { cargo: number; chargement: number; revenus: number; chanceux: boolean; typeCargaison: TypeCargaison } {
  const prixNettoye = sanitizePrix(prixCargo);
  const coefficientMoyen = calculerCoefficientChargementCargo(codeDepart, codeArrivee, prixNettoye);
  
  // Générer le type de cargaison
  const typeCargaison = genererTypeCargaison();
  
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU_CARGO) {
    return { cargo: 0, chargement: 0, revenus: 0, chanceux: false, typeCargaison };
  }
  
  // Variation aléatoire ±20% (réduit de 30% à 20% pour plus de réalisme)
  const variationMax = 0.20;
  const aleatoire = (Math.random() * 2 - 1) * variationMax;
  
  let coefficientReel = coefficientMoyen + aleatoire;
  
  // PLAFOND À 100% : on ne peut pas charger plus que la capacité physique !
  // Les bonus servent à AUGMENTER LES CHANCES d'avoir un bon remplissage,
  // pas à dépasser la capacité.
  coefficientReel = Math.max(0, Math.min(1.0, coefficientReel));
  
  const chanceux = aleatoire > 0.10 && coefficientMoyen < 0.5;
  
  const cargoPotentiel = Math.floor(capaciteCargo * coefficientReel);
  
  // Limité par le cargo disponible ET la capacité
  const cargo = Math.min(cargoPotentiel, cargoDisponible, capaciteCargo);
  
  const chargement = capaciteCargo > 0 ? cargo / capaciteCargo : 0;
  const revenus = cargo * prixNettoye;

  return { cargo, chargement, revenus, chanceux, typeCargaison };
}
