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
  { code: 'IKFL', nom: 'Keflavik Airport', taille: 'small', tourisme: true, passagersMax: 2000, cargoMax: 15000, industriel: false, vor: 'GVK', freq: '112.320' },
  { code: 'ITEY', nom: 'Pingeyri Airport', taille: 'small', tourisme: true, passagersMax: 1000, cargoMax: 5000, industriel: false },
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
  { code: 'KEFLAVIK', nom: 'Keflavik FIR', type: 'FIR' },
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
// SYSTÈME DE DEMANDE LOGISTIQUE — VERSION REFONDUE
// =====================================================
// Remplace l'ancien système de zones (attractive / élevée / critique) par une
// courbe logistique (sigmoïde) unique paramétrée par taille d'aéroport.
//
// Formule : taux = maxRate × 1 / (1 + exp(slope × (prix − ref × CENTER_MULTIPLIER)))
//
// Calibration retenue (CENTER_MULTIPLIER = 1.75) :
//   - prix = ref      → ~94 % du maxRate
//   - prix = 2 × ref  → ~28 %
//   - prix = 3 × ref  → ~1 %
// =====================================================

export interface ParamsLogistique {
  /** Prix d'ancrage (≈ prix attendu pour ~95 % de remplissage). */
  ref: number;
  /** Raideur de la courbe : plus c'est grand, plus la chute est brutale. */
  slope: number;
  /** Plafond absolu de remplissage pour ce type d'aéroport. */
  maxRate: number;
}

export const PARAMS_PAX: Record<TailleAeroport, ParamsLogistique> = {
  international: { ref: 150, slope: 0.025, maxRate: 1.10 },
  regional:      { ref: 100, slope: 0.025, maxRate: 1.10 },
  small:         { ref: 70,  slope: 0.025, maxRate: 1.10 },
  military:      { ref: 40,  slope: 0.025, maxRate: 0.20 },
};

export const PARAMS_CARGO: Record<TailleAeroport, ParamsLogistique> = {
  international: { ref: 1.20, slope: 3.0, maxRate: 1.0 },
  regional:      { ref: 0.90, slope: 3.0, maxRate: 1.0 },
  small:         { ref: 0.75, slope: 3.0, maxRate: 1.0 },
  military:      { ref: 1.50, slope: 3.0, maxRate: 1.0 },
};

/** Décalage du point d'inflexion : centre = ref × CENTER_MULTIPLIER. */
export const CENTER_MULTIPLIER = 1.75;

/**
 * Cap absolu sur la somme des buffs additifs (tourisme + hub-hub + isolement
 * pour PAX ; industriel + militaire + isolement pour CARGO). Empêche un
 * aéroport "ultra-favorable" de rendre le prix totalement inerte.
 */
export const BUFFS_CAP = 0.50;

/** Buffs additifs PAX (avant cap). */
const BUFF_TOURISME_PAX = 0.25;
const BUFF_HUB_HUB_PAX = 0.15;

/** Buffs additifs CARGO (avant cap). */
const BUFF_INDUSTRIEL_CARGO = 0.30;
const BUFF_MILITAIRE_CARGO = 0.20;

/** Malus multiplicatifs (PAX et CARGO). */
const MALUS_SATURATION = 0.50;
const MALUS_PETIT_AEROPORT = 0.60;
const SEUIL_SATURATION = 0.30; // < 30 % de stock dispo
const SEUIL_PETIT_AVION_PAX = 150;
const SEUIL_PETIT_AVION_CARGO_KG = 30000; // 30 t

/** Garde-fous absolus : au-delà, aucun passager / kg, sans calcul. */
export const PRIX_MAXIMUM_ABSOLU = 500; // F$/billet
export const PRIX_MAXIMUM_ABSOLU_CARGO = 5; // F$/kg

/**
 * Fonction logistique : prix → taux de remplissage moyen.
 * Centrée sur ref × CENTER_MULTIPLIER pour donner ~95 % du maxRate au prix de
 * référence et descendre fortement au-delà.
 */
function logistic(price: number, p: ParamsLogistique): number {
  const center = p.ref * CENTER_MULTIPLIER;
  return p.maxRate * (1 / (1 + Math.exp(p.slope * (price - center))));
}

/**
 * Bonus d'isolement : plus l'aéroport d'arrivée est resté sans vol, plus la
 * demande s'accumule. Échelle : 3h / 8h / 24h / 72h.
 */
export function getBonusIsolement(lastArrival: Date | null | undefined): number {
  if (!lastArrival) return BUFFS_CAP > 0.60 ? 0.60 : BUFFS_CAP;
  const heures = (Date.now() - lastArrival.getTime()) / 3_600_000;
  if (heures >= 72) return 0.60;
  if (heures >= 24) return 0.45;
  if (heures >= 8)  return 0.30;
  if (heures >= 3)  return 0.15;
  return 0;
}

/** Contexte additionnel pour affiner le calcul du coefficient. */
export interface CoefficientContext {
  lastArrivalAtArrivee?: Date | null;
  ratioPaxDispo?: number;
  ratioCargoDispo?: number;
  capacitePax?: number;
  capaciteCargoKg?: number;
}

/**
 * Coefficient de remplissage PAX (entre 0 et maxRate du couple départ/arrivée).
 *
 * Ordre figé d'application :
 *   1. Garde-fou prix max absolu → 0
 *   2. Taux base = logistic(prix, params moyens)
 *   3. Slope réduite si Hub-Hub (× 0.5) ou Régional-Régional (× 0.75)
 *   4. Somme des buffs additifs (tourisme, hub-hub, isolement) cappée à BUFFS_CAP
 *   5. Malus multiplicatif saturation (< 30 % dispo) puis petit-aéroport+gros-avion
 *   6. Plafond final maxRate
 */
export function calculerCoefficientRemplissage(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  ctx?: CoefficientContext
): number {
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  if (!aD || !aA) return 1.0;

  const prix = sanitizePrix(prixBillet);
  if (prix >= PRIX_MAXIMUM_ABSOLU) return 0;

  const pD = PARAMS_PAX[aD.taille];
  const pA = PARAMS_PAX[aA.taille];
  let params: ParamsLogistique = {
    ref: (pD.ref + pA.ref) / 2,
    slope: (pD.slope + pA.slope) / 2,
    maxRate: Math.min(pD.maxRate, pA.maxRate),
  };

  if (aD.taille === 'international' && aA.taille === 'international') {
    params = { ...params, slope: params.slope * 0.5 };
  } else if (aD.taille === 'regional' && aA.taille === 'regional') {
    params = { ...params, slope: params.slope * 0.75 };
  }

  const base = logistic(prix, params);

  let buffs = 0;
  if (aA.tourisme) buffs += BUFF_TOURISME_PAX;
  if (aD.taille === 'international' && aA.taille === 'international') buffs += BUFF_HUB_HUB_PAX;
  buffs += getBonusIsolement(ctx?.lastArrivalAtArrivee ?? null);
  buffs = Math.min(BUFFS_CAP, buffs);

  let taux = base + buffs;

  if (ctx?.ratioPaxDispo !== undefined && ctx.ratioPaxDispo < SEUIL_SATURATION) {
    taux *= MALUS_SATURATION;
  }
  if ((aD.taille === 'small' || aA.taille === 'small') && (ctx?.capacitePax ?? 0) > SEUIL_PETIT_AVION_PAX) {
    taux *= MALUS_PETIT_AEROPORT;
  }

  return Math.max(0, Math.min(params.maxRate, taux));
}

/**
 * Prix optimal recommandé pour une liaison PAX (utilisé par l'UI tarifs).
 * `optimal` = prix de référence (donne ~95 % de remplissage).
 * `critique` ≈ 2 × ref (descente brutale au-delà).
 */
export function getPrixOptimal(codeDepart: string, codeArrivee: string): { min: number; optimal: number; max: number; critique: number; maxAbsolu: number } {
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  if (!aD || !aA) {
    return { min: 40, optimal: 100, max: 150, critique: 200, maxAbsolu: PRIX_MAXIMUM_ABSOLU };
  }
  const ref = Math.round((PARAMS_PAX[aD.taille].ref + PARAMS_PAX[aA.taille].ref) / 2);
  return {
    min: Math.round(ref * 0.5),
    optimal: ref,
    max: Math.round(ref * 1.5),
    critique: ref * 2,
    maxAbsolu: PRIX_MAXIMUM_ABSOLU,
  };
}

/** Estimation moyenne PAX (déterministe, pour affichage prévisionnel). */
export function estimerPassagers(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  capaciteAvion: number,
  passagersDisponibles: number,
  ctx?: CoefficientContext
): { passagers: number; remplissage: number; revenus: number; avertissement: string | null } {
  const prixNettoye = sanitizePrix(prixBillet);
  const ctxComplet: CoefficientContext = {
    ...ctx,
    capacitePax: ctx?.capacitePax ?? capaciteAvion,
  };
  const coefficient = calculerCoefficientRemplissage(codeDepart, codeArrivee, prixNettoye, ctxComplet);

  // Le coefficient peut dépasser 1.0 en interne (maxRate jusqu'à 1.10) suite aux
  // buffs cumulés. Le résultat final est néanmoins plafonné à la capacité physique
  // de l'avion (impossible d'embarquer plus que les sièges).
  const passagersPotentiels = Math.floor(capaciteAvion * coefficient);
  const passagers = Math.min(passagersPotentiels, capaciteAvion, passagersDisponibles);
  const remplissage = capaciteAvion > 0 ? passagers / capaciteAvion : 0;
  const revenus = passagers * prixNettoye;

  // Avertissements recalibrés sur la nouvelle courbe.
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  const refMoyen = aD && aA ? (PARAMS_PAX[aD.taille].ref + PARAMS_PAX[aA.taille].ref) / 2 : 100;

  let avertissement: string | null = null;
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU) {
    avertissement = '⛔ Prix trop élevé ! Aucun passager ne peut payer ce prix.';
  } else if (prixNettoye > refMoyen * 2.5) {
    avertissement = '🔴 Prix abusif ! Très peu de passagers accepteront.';
  } else if (prixNettoye > refMoyen * 2) {
    avertissement = '🟠 Prix élevé. Le remplissage sera faible.';
  } else if (prixNettoye > refMoyen * 1.5) {
    avertissement = '🟡 Prix au-dessus de la moyenne. Remplissage réduit.';
  }

  return { passagers, remplissage, revenus, avertissement };
}

/**
 * Calcule le nombre RÉEL de passagers (côté serveur, avec variance ±10 %).
 *
 * La variance est volontairement plus faible qu'avant (était ±30 %) pour que
 * l'estimation client soit prédictive et que le résultat ne s'écarte pas
 * trop de ce qui est annoncé.
 */
export function calculerPassagersReels(
  codeDepart: string,
  codeArrivee: string,
  prixBillet: number,
  capaciteAvion: number,
  passagersDisponibles: number,
  ctx?: CoefficientContext
): { passagers: number; remplissage: number; revenus: number; chanceux: boolean } {
  const prixNettoye = sanitizePrix(prixBillet);
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU) {
    return { passagers: 0, remplissage: 0, revenus: 0, chanceux: false };
  }

  const ctxComplet: CoefficientContext = {
    ...ctx,
    capacitePax: ctx?.capacitePax ?? capaciteAvion,
  };
  const coefficientMoyen = calculerCoefficientRemplissage(codeDepart, codeArrivee, prixNettoye, ctxComplet);

  const variationMax = 0.10; // ±10 % (était ±30 %)
  const aleatoire = (Math.random() * 2 - 1) * variationMax;
  let coefficientReel = coefficientMoyen + aleatoire;

  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  const maxRate = aD && aA
    ? Math.min(PARAMS_PAX[aD.taille].maxRate, PARAMS_PAX[aA.taille].maxRate)
    : 1.10;
  coefficientReel = Math.max(0, Math.min(maxRate, coefficientReel));

  const chanceux = aleatoire > 0.05 && coefficientMoyen < 0.5;

  // Plafonnement à la capacité physique de l'avion : le coefficient peut dépasser 1.0
  // en interne (maxRate jusqu'à 1.10 + variance positive) mais on ne peut jamais
  // embarquer plus de passagers qu'il n'y a de sièges.
  const passagersPotentiels = Math.floor(capaciteAvion * coefficientReel);
  const passagers = Math.min(passagersPotentiels, capaciteAvion, passagersDisponibles);
  const remplissage = capaciteAvion > 0 ? passagers / capaciteAvion : 0;
  const revenus = passagers * prixNettoye;

  return { passagers, remplissage, revenus, chanceux };
}

// =====================================================
// SYSTÈME DE DEMANDE CARGO — VERSION REFONDUE
// =====================================================
// Symétrique à la demande PAX : courbe logistique paramétrée par taille
// d'aéroport (cf. PARAMS_CARGO ci-dessus).
//
// Buffs additifs spécifiques :
//   - Industriel (départ OU arrivée) → +0.30
//   - Militaire (départ OU arrivée)  → +0.20
//   - Isolement                       → 0.15 / 0.30 / 0.45 / 0.60
//   Somme cappée à BUFFS_CAP (0.50).
//
// Équilibrage : un vol cargo plein au prix optimal rapporte ~1.5–2× un vol
// PAX plein équivalent. Boeing 777F (~50 t) à 1.2 F$/kg ≈ 60 000 F$.

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
 * Coefficient de chargement CARGO (entre 0 et 1.0).
 *
 * Ordre figé d'application :
 *   1. Garde-fou prix max absolu CARGO → 0
 *   2. Taux base = logistic(prix, params moyens)
 *   3. Somme des buffs additifs (industriel, militaire, isolement) cappée à BUFFS_CAP
 *   4. Malus saturation (< 30 % dispo) puis petit-aéroport+gros-cargo (>30 t)
 *   5. Plafond final 1.0 (jamais plus que la capacité physique)
 */
export function calculerCoefficientChargementCargo(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number,
  ctx?: CoefficientContext
): number {
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  if (!aD || !aA) return 1.0;

  const prix = sanitizePrix(prixCargo);
  if (prix >= PRIX_MAXIMUM_ABSOLU_CARGO) return 0;

  const pD = PARAMS_CARGO[aD.taille];
  const pA = PARAMS_CARGO[aA.taille];
  const params: ParamsLogistique = {
    ref: (pD.ref + pA.ref) / 2,
    slope: (pD.slope + pA.slope) / 2,
    maxRate: Math.min(pD.maxRate, pA.maxRate),
  };

  const base = logistic(prix, params);

  let buffs = 0;
  if (aD.industriel || aA.industriel) buffs += BUFF_INDUSTRIEL_CARGO;
  if (aD.taille === 'military' || aA.taille === 'military') buffs += BUFF_MILITAIRE_CARGO;
  buffs += getBonusIsolement(ctx?.lastArrivalAtArrivee ?? null);
  buffs = Math.min(BUFFS_CAP, buffs);

  let taux = base + buffs;

  if (ctx?.ratioCargoDispo !== undefined && ctx.ratioCargoDispo < SEUIL_SATURATION) {
    taux *= MALUS_SATURATION;
  }
  if ((aD.taille === 'small' || aA.taille === 'small') && (ctx?.capaciteCargoKg ?? 0) > SEUIL_PETIT_AVION_CARGO_KG) {
    taux *= MALUS_PETIT_AEROPORT;
  }

  return Math.max(0, Math.min(1.0, taux));
}

/** Prix optimal recommandé pour le cargo (utilisé par l'UI tarifs). */
export function getPrixOptimalCargo(codeDepart: string, codeArrivee: string): { min: number; optimal: number; max: number; critique: number; maxAbsolu: number } {
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  if (!aD || !aA) {
    return { min: 0.5, optimal: 1, max: 1.5, critique: 2, maxAbsolu: PRIX_MAXIMUM_ABSOLU_CARGO };
  }
  const ref = (PARAMS_CARGO[aD.taille].ref + PARAMS_CARGO[aA.taille].ref) / 2;
  return {
    min: Math.max(0.1, +(ref * 0.5).toFixed(2)),
    optimal: +ref.toFixed(2),
    max: +(ref * 1.5).toFixed(2),
    critique: +(ref * 2).toFixed(2),
    maxAbsolu: PRIX_MAXIMUM_ABSOLU_CARGO,
  };
}

/** Estimation moyenne CARGO (déterministe, pour affichage prévisionnel). */
export function estimerCargo(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number,
  capaciteCargo: number,
  cargoDisponible: number,
  ctx?: CoefficientContext
): { cargo: number; chargement: number; revenus: number; avertissement: string | null } {
  const prixNettoye = sanitizePrix(prixCargo);
  const ctxComplet: CoefficientContext = {
    ...ctx,
    capaciteCargoKg: ctx?.capaciteCargoKg ?? capaciteCargo,
  };
  const coefficient = calculerCoefficientChargementCargo(codeDepart, codeArrivee, prixNettoye, ctxComplet);

  const cargoPotentiel = Math.floor(capaciteCargo * Math.min(coefficient, 1.0));
  const cargo = Math.min(cargoPotentiel, cargoDisponible, capaciteCargo);
  const chargement = capaciteCargo > 0 ? cargo / capaciteCargo : 0;
  const revenus = cargo * prixNettoye;

  // Avertissements recalibrés sur la nouvelle courbe.
  const aD = getAeroportInfo(codeDepart);
  const aA = getAeroportInfo(codeArrivee);
  const refMoyen = aD && aA ? (PARAMS_CARGO[aD.taille].ref + PARAMS_CARGO[aA.taille].ref) / 2 : 1;

  let avertissement: string | null = null;
  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU_CARGO) {
    avertissement = '⛔ Prix trop élevé ! Personne n\'expédie à ce tarif.';
  } else if (prixNettoye > refMoyen * 2.5) {
    avertissement = '🔴 Prix abusif ! Très peu de cargo.';
  } else if (prixNettoye > refMoyen * 2) {
    avertissement = '🟠 Prix élevé. Chargement faible.';
  } else if (prixNettoye > refMoyen * 1.5) {
    avertissement = '🟡 Prix au-dessus de la moyenne.';
  }

  return { cargo, chargement, revenus, avertissement };
}

/**
 * Calcule le cargo RÉEL côté serveur (variance ±12 %, était ±20 %).
 * Génère également le type de cargaison (cf. genererTypeCargaison).
 */
export function calculerCargoReel(
  codeDepart: string,
  codeArrivee: string,
  prixCargo: number,
  capaciteCargo: number,
  cargoDisponible: number,
  ctx?: CoefficientContext
): { cargo: number; chargement: number; revenus: number; chanceux: boolean; typeCargaison: TypeCargaison } {
  const prixNettoye = sanitizePrix(prixCargo);
  const typeCargaison = genererTypeCargaison();

  if (prixNettoye >= PRIX_MAXIMUM_ABSOLU_CARGO) {
    return { cargo: 0, chargement: 0, revenus: 0, chanceux: false, typeCargaison };
  }

  const ctxComplet: CoefficientContext = {
    ...ctx,
    capaciteCargoKg: ctx?.capaciteCargoKg ?? capaciteCargo,
  };
  const coefficientMoyen = calculerCoefficientChargementCargo(codeDepart, codeArrivee, prixNettoye, ctxComplet);

  const variationMax = 0.12; // ±12 % (était ±20 %)
  const aleatoire = (Math.random() * 2 - 1) * variationMax;
  let coefficientReel = coefficientMoyen + aleatoire;
  coefficientReel = Math.max(0, Math.min(1.0, coefficientReel));

  const chanceux = aleatoire > 0.06 && coefficientMoyen < 0.5;

  const cargoPotentiel = Math.floor(capaciteCargo * coefficientReel);
  const cargo = Math.min(cargoPotentiel, cargoDisponible, capaciteCargo);
  const chargement = capaciteCargo > 0 ? cargo / capaciteCargo : 0;
  const revenus = cargo * prixNettoye;

  return { cargo, chargement, revenus, chanceux, typeCargaison };
}
