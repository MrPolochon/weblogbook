/**
 * Génère le seed SQL des 1000 NOTAMs PTFS (versions anglaise + française).
 *
 *   npx tsx scripts/generate-notams-ptfs.ts
 *
 * Sortie : supabase/seed_notams_ptfs_1000.sql
 *
 * Conventions reprises des seeds existants :
 *   - identifiant anglais {OACI}-A{NNNN}/{YY}, français {OACI}-F{NNNN}/{YY}
 *   - reference_fr pointe, sur l'anglais, vers l'identifiant français ;
 *     les NOTAM français ont reference_fr NULL
 *   - textes en majuscules sans accents (style télétype aéronautique)
 *
 * Les numéros commencent à 0100 : les seeds précédents occupent 0001..0045 et
 * les permanents IRFD 0090..0094.
 *
 * Les valeurs variables (piste, hauteur, fréquence…) sont tirées une seule fois
 * par NOTAM puis partagées par les deux langues : les deux versions décrivent
 * donc toujours exactement le même événement.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = join(process.cwd(), 'supabase', 'seed_notams_ptfs_1000.sql');
const TOTAL = 1000;
const FIRST_NUMBER = 100;

/** Générateur pseudo-aléatoire déterministe : la sortie est reproductible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260903);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

/**
 * Pistes et voies de circulation réelles, reprises de
 * src/lib/ptfs-perf/data/airports.ts. Les aérodromes absents de ce référentiel
 * n'ont pas de pistes déclarées : ils ne reçoivent que des NOTAM génériques,
 * pour ne pas inventer de désignateurs.
 *
 * ATTENTION AUX UNITES : `toraFt` est en PIEDS, comme dans ptfs-perf (l'UI y
 * affiche « RWY 25R (5793 ft) »). Les NOTAM de distances déclarées sont, eux,
 * exprimés en METRES : la conversion est faite au moment du rendu, jamais
 * avant, pour qu'aucune distance annoncee ne depasse la piste reelle.
 */
type Rwy = {
  name: string;
  toraFt: number;
  /** Mettre à false quand un NOTAM permanent fixe déjà les distances déclarées. */
  declaredDistances?: boolean;
};
type Terrain = { code: string; rwy: readonly Rwy[]; twy: readonly string[] };

const FT_TO_M = 0.3048;

const TERRAINS: readonly Terrain[] = [
  { code: 'ITKO', rwy: [{ name: '02', toraFt: 6508 }, { name: '20', toraFt: 6508 }, { name: '13', toraFt: 8092 }, { name: '31', toraFt: 8092 }], twy: ['D1', 'D2', 'D3', 'D4', 'D5', 'B2', 'B3', 'B4', 'B6', 'B7', 'B8', 'B10', 'B11', 'B12'] },
  { code: 'IPPH', rwy: [{ name: '11', toraFt: 7397 }, { name: '29', toraFt: 7397 }, { name: '15', toraFt: 5875 }, { name: '33', toraFt: 5575 }], twy: ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'C1', 'C3', 'C4', 'E'] },
  { code: 'ILAR', rwy: [{ name: '06', toraFt: 5818 }, { name: '24', toraFt: 5818 }], twy: ['C1', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] },
  { code: 'IPAP', rwy: [{ name: '17', toraFt: 5802 }, { name: '35', toraFt: 5802 }], twy: ['B1', 'B2', 'C1', 'C2', 'C3', 'C4'] },
  // IRFD : TWY A et H sont couverts par les NOTAM permanents, exclus du tirage.
  // La bande 07L/25R fait 5793 FT (1766 M) hors travaux. Pendant les travaux il
  // n'en reste qu'environ 1039 M, dont 720 M declares : c'est le NOTAM permanent
  // IRFD-A0094 qui porte ces distances, donc aucun NOTAM de distances genere ici
  // (il le contredirait).
  {
    code: 'IRFD',
    rwy: [
      { name: '07L', toraFt: 5793, declaredDistances: false },
      { name: '07C', toraFt: 6246 },
      { name: '07R', toraFt: 6731 },
      { name: '25L', toraFt: 6731 },
      { name: '25C', toraFt: 6246 },
      { name: '25R', toraFt: 5793, declaredDistances: false },
    ],
    twy: ['B1', 'B2', 'C', 'E', 'E1', 'E2', 'F', 'G1', 'G2', 'G3', 'M1', 'M2'],
  },
  { code: 'IMLR', rwy: [{ name: '07', toraFt: 5325 }, { name: '25', toraFt: 5325 }], twy: ['A1', 'A2', 'B', 'C'] },
  { code: 'IZOL', rwy: [{ name: '10', toraFt: 7389 }, { name: '28', toraFt: 8155 }], twy: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'] },
  { code: 'ISAU', rwy: [{ name: '08', toraFt: 4290 }, { name: '26', toraFt: 4290 }], twy: ['A1', 'A2'] },
  { code: 'IJAF', rwy: [{ name: '07', toraFt: 3884 }, { name: '25', toraFt: 3884 }], twy: [] },
  { code: 'IBLT', rwy: [], twy: [] },
  { code: 'IDCS', rwy: [], twy: [] },
  { code: 'IKFL', rwy: [{ name: '07', toraFt: 3471 }, { name: '25', toraFt: 3471 }, { name: '16', toraFt: 3471 }, { name: '34', toraFt: 3471 }], twy: ['A1', 'B', 'C', 'D', 'E', 'F'] },
  { code: 'ITEY', rwy: [{ name: '13', toraFt: 1387 }, { name: '31', toraFt: 1387 }], twy: ['P'] },
  { code: 'IBTH', rwy: [{ name: '09', toraFt: 2612 }, { name: '27', toraFt: 2612 }], twy: ['A', 'B', 'C'] },
  { code: 'ISKP', rwy: [], twy: [] },
  // ILKL : la 27 a un TORA nul (Lukla ne decolle qu'en 09), pas de depart dessus.
  { code: 'ILKL', rwy: [{ name: '09', toraFt: 2157 }, { name: '27', toraFt: 0 }], twy: ['A', 'B'] },
  { code: 'IBAR', rwy: [], twy: [] },
  { code: 'IHEN', rwy: [], twy: [] },
  { code: 'ITRC', rwy: [], twy: [] },
  { code: 'IBRD', rwy: [], twy: [] },
  { code: 'IUFO', rwy: [], twy: [] },
  { code: 'IIAB', rwy: [{ name: '09L', toraFt: 7346 }, { name: '09R', toraFt: 7371 }, { name: '27L', toraFt: 7371 }, { name: '27R', toraFt: 7346 }], twy: ['D1', 'D2', 'I1', 'I2', 'J1', 'J2', 'L1', 'L2'] },
  { code: 'IGAR', rwy: [], twy: [] },
  { code: 'ISCM', rwy: [], twy: [] },
  { code: 'IGFD', rwy: [], twy: [] },
  { code: 'IQEL', rwy: [], twy: [] },
];

const NAVAIDS = ['DME', 'VOR', 'NDB', 'ADF', 'GS', 'LOC', 'TACAN', 'VASI', 'PAPI', 'GPS RNAV', 'ILS CAT I', 'ILS CAT II', 'ILS CAT III'];
const FUELS = ['JET A', 'JET A1', 'AVGAS 100LL'];
const SERVICES = ['DEL', 'GND', 'TWR', 'APP', 'ATIS'];
const FREQS = ['118.500', '119.100', '123.800', '126.200', '128.750', '130.025', '132.450', '134.600'];

/** Toutes les valeurs variables d'un NOTAM, tirées une fois pour les deux langues. */
type Vars = {
  rwy: string; twy: string;
  stand: number; gate: number; rff: number;
  snow: number; tora: number;
  obstHgt: number; obstDist: number; obstBrg: string; craneHgt: number;
  uasDist: number; uasAlt: number; fl: number;
  milBase: number; milTop: number;
  hrOpen: string; hrClose: string;
  navaid: string; fuel: string; svc: string; freq: string;
};

type Tpl = {
  q: string;
  prio: 'A' | 'B' | 'C';
  /** `tora` = exige une piste dont le TORA est non nul (départ possible). */
  needs?: 'rwy' | 'twy' | 'tora';
  /** Durée de validité, en heures (min, max). */
  hours: readonly [number, number];
  en: (v: Vars) => string;
  fr: (v: Vars) => string;
};

const TEMPLATES: readonly Tpl[] = [
  // ---- Pistes --------------------------------------------------------------
  {
    q: 'QMRLC', prio: 'A', needs: 'rwy', hours: [6, 240],
    en: (v) => `RWY ${v.rwy} CLSD DUE TO MAINTENANCE WORK.`,
    fr: (v) => `PISTE ${v.rwy} FERMEE POUR TRAVAUX DE MAINTENANCE.`,
  },
  {
    q: 'QMRXX', prio: 'B', needs: 'rwy', hours: [3, 36],
    en: (v) => `RWY ${v.rwy} COVERED BY SNOW DEPTH ${v.snow}CM, BRAKING ACTION MEDIUM.`,
    fr: (v) => `PISTE ${v.rwy} COUVERTE DE NEIGE, EPAISSEUR ${v.snow}CM, EFFICACITE DE FREINAGE MOYENNE.`,
  },
  {
    q: 'QMRXX', prio: 'C', needs: 'rwy', hours: [72, 720],
    en: (v) => `RWY ${v.rwy} MARKINGS FADED, EXERCISE CAUTION.`,
    fr: (v) => `MARQUAGES DE LA PISTE ${v.rwy} EFFACES, PRUDENCE.`,
  },
  {
    q: 'QMRXX', prio: 'A', needs: 'rwy', hours: [1, 6],
    en: (v) => `FOD REPORTED RWY ${v.rwy}, INSPECTION IN PROGRESS.`,
    fr: (v) => `DEBRIS SIGNALES SUR LA PISTE ${v.rwy}, INSPECTION EN COURS.`,
  },
  {
    q: 'QMRXX', prio: 'B', needs: 'tora', hours: [48, 480],
    en: (v) => `RWY ${v.rwy} DECLARED DISTANCES REDUCED, TORA ${v.tora}M AVBL.`,
    fr: (v) => `DISTANCES DECLAREES DE LA PISTE ${v.rwy} REDUITES, TORA ${v.tora}M DISPONIBLE.`,
  },
  {
    q: 'QOLAS', prio: 'B', needs: 'rwy', hours: [12, 240],
    en: (v) => `RWY ${v.rwy} EDGE LGT U/S.`,
    fr: (v) => `BALISAGE LATERAL DE LA PISTE ${v.rwy} HORS SERVICE.`,
  },
  {
    q: 'QLPAS', prio: 'B', needs: 'rwy', hours: [12, 360],
    en: (v) => `PAPI RWY ${v.rwy} U/S.`,
    fr: (v) => `PAPI DE LA PISTE ${v.rwy} HORS SERVICE.`,
  },
  {
    q: 'QICAS', prio: 'B', needs: 'rwy', hours: [24, 336],
    en: (v) => `ILS RWY ${v.rwy} DOWNGRADED FROM CAT III TO CAT I DUE TO MAINT.`,
    fr: (v) => `ILS DE LA PISTE ${v.rwy} DECLASSE DE CAT III A CAT I POUR MAINTENANCE.`,
  },
  {
    q: 'QFAXX', prio: 'C', needs: 'rwy', hours: [48, 720],
    en: (v) => `NOISE ABATEMENT PROC RWY ${v.rwy} SUSPENDED UNTIL FURTHER NOTICE.`,
    fr: (v) => `PROCEDURE DE MOINDRE BRUIT DE LA PISTE ${v.rwy} SUSPENDUE JUSQU'A NOUVEL AVIS.`,
  },
  {
    q: 'QFAXX', prio: 'A', needs: 'rwy', hours: [2, 12],
    en: (v) => `WIND SHEAR REPORTED RWY ${v.rwy} ON APCH, CAUTION ADVISED.`,
    fr: (v) => `CISAILLEMENT DE VENT SIGNALE EN APPROCHE DE LA PISTE ${v.rwy}, PRUDENCE.`,
  },

  // ---- Voies de circulation et aires ---------------------------------------
  {
    q: 'QMXLC', prio: 'B', needs: 'twy', hours: [24, 720],
    en: (v) => `TWY ${v.twy} CLSD DUE TO CONSTRUCTION.`,
    fr: (v) => `VOIE DE CIRCULATION ${v.twy} FERMEE POUR TRAVAUX.`,
  },
  {
    q: 'QMKLC', prio: 'B', hours: [24, 480],
    en: (v) => `APRON STAND ${v.stand} CLSD DUE TO WORK IN PROGRESS.`,
    fr: (v) => `POSTE DE STATIONNEMENT ${v.stand} FERME POUR TRAVAUX EN COURS.`,
  },
  {
    q: 'QMKAU', prio: 'C', hours: [12, 336],
    en: (v) => `GATE ${v.gate} UNAVBL, REASSIGN OPS TO ADJACENT STAND.`,
    fr: (v) => `PORTE ${v.gate} INDISPONIBLE, REPORTER LES OPERATIONS SUR UN POSTE ADJACENT.`,
  },
  {
    q: 'QHALC', prio: 'B', hours: [48, 720],
    en: () => 'HELIPAD CLSD DUE TO RESURFACING WORK.',
    fr: () => 'HELISTATION FERMEE POUR TRAVAUX DE RESURFACAGE.',
  },

  // ---- Aides à la navigation -----------------------------------------------
  {
    q: 'QNAAS', prio: 'B', hours: [6, 240],
    en: (v) => `${v.navaid} U/S.`,
    fr: (v) => `${v.navaid} HORS SERVICE.`,
  },
  {
    q: 'QNAAC', prio: 'B', hours: [24, 480],
    en: (v) => `${v.navaid} WITHDRAWN FOR MAINTENANCE.`,
    fr: (v) => `${v.navaid} RETIRE DU SERVICE POUR MAINTENANCE.`,
  },
  {
    q: 'QNVAS', prio: 'C', hours: [24, 336],
    en: () => 'VOR CHECKPOINT TEMPORARILY UNRELIABLE, CROSSCHECK REQUIRED.',
    fr: () => 'POINT DE CONTROLE VOR TEMPORAIREMENT NON FIABLE, RECOUPEMENT NECESSAIRE.',
  },
  {
    q: 'QCMAS', prio: 'B', hours: [6, 120],
    en: () => 'SURFACE MOVEMENT RADAR (SMR) U/S, REDUCED VISIBILITY PROC APPLY.',
    fr: () => 'RADAR DE MOUVEMENTS AU SOL (SMR) HORS SERVICE, PROCEDURES PAR FAIBLE VISIBILITE APPLICABLES.',
  },
  {
    q: 'QLBAS', prio: 'C', hours: [24, 480],
    en: () => 'AD BEACON U/S.',
    fr: () => "PHARE D'AERODROME HORS SERVICE.",
  },

  // ---- Obstacles -----------------------------------------------------------
  {
    q: 'QOBCE', prio: 'B', hours: [168, 2160],
    en: (v) => `OBST CRANE ERECTED ${v.obstHgt}FT AGL, ${v.obstDist}NM ${v.obstBrg} DEG FROM ARP, UNLGT.`,
    fr: (v) => `OBSTACLE : GRUE ERIGEE A ${v.obstHgt}FT AGL, ${v.obstDist}NM AU RELEVEMENT ${v.obstBrg} DEG DE L'ARP, NON BALISEE.`,
  },
  {
    q: 'QOBCE', prio: 'B', hours: [168, 1440],
    en: (v) => `CRANE OPS WI AD PERIMETER, MAX HGT ${v.craneHgt}FT AGL, DAY ONLY.`,
    fr: (v) => `GRUE EN SERVICE DANS L'ENCEINTE DE L'AD, HAUTEUR MAX ${v.craneHgt}FT AGL, DE JOUR UNIQUEMENT.`,
  },

  // ---- Activités et dangers ------------------------------------------------
  {
    q: 'QAVXX', prio: 'C', hours: [24, 720],
    en: () => 'INCR BIRD ACT REPORTED IN VICINITY OF AD, EXERCISE CAUTION.',
    fr: () => "ACTIVITE AVIAIRE ACCRUE SIGNALEE AUX ABORDS DE L'AD, PRUDENCE.",
  },
  {
    q: 'QAVXX', prio: 'C', hours: [6, 96],
    en: () => 'WILDLIFE CONTROL OPS IN PROGRESS, EXPECT PYROTECHNIC NOISE.',
    fr: () => "OPERATIONS D'EFFAROUCHEMENT EN COURS, DETONATIONS PYROTECHNIQUES A PREVOIR.",
  },
  {
    q: 'QOAXX', prio: 'B', hours: [3, 72],
    en: (v) => `UAS ACTIVITY REPORTED WI ${v.uasDist}NM OF AD, MAX ALT ${v.uasAlt}FT AGL.`,
    fr: (v) => `ACTIVITE DE DRONES SIGNALEE DANS UN RAYON DE ${v.uasDist}NM DE L'AD, ALTITUDE MAX ${v.uasAlt}FT AGL.`,
  },
  {
    q: 'QWTXX', prio: 'C', hours: [6, 168],
    en: () => 'LASER BEAM EXPOSURE ACTIVITY REPORTED IN VICINITY OF AD.',
    fr: () => "EXPOSITION A DES FAISCEAUX LASER SIGNALEE AUX ABORDS DE L'AD.",
  },
  {
    q: 'QWPXX', prio: 'B', hours: [4, 48],
    en: (v) => `PARACHUTE JUMPING ACTIVITY UP TO FL${v.fl}.`,
    fr: (v) => `ACTIVITE DE PARACHUTISME JUSQU'AU FL${v.fl}.`,
  },
  {
    q: 'QWGXX', prio: 'C', hours: [6, 168],
    en: () => 'GLIDER FLYING ACTIVITY IN PROGRESS, SEE AND AVOID.',
    fr: () => 'ACTIVITE DE VOL A VOILE EN COURS, VOIR ET EVITER.',
  },
  {
    q: 'QWAXX', prio: 'B', hours: [4, 72],
    en: () => 'AIR DISPLAY IN PROGRESS, ACFT ADVISED TO AVOID AREA.',
    fr: () => 'MEETING AERIEN EN COURS, EVITEMENT DE LA ZONE RECOMMANDE.',
  },
  {
    q: 'QWMXX', prio: 'B', hours: [6, 240],
    en: (v) => `MILITARY EXERCISE ACT WI DESIGNATED AREA, ${v.milBase}FT-${v.milTop}FT AGL.`,
    fr: (v) => `EXERCICE MILITAIRE DANS LA ZONE DESIGNEE, ${v.milBase}FT-${v.milTop}FT AGL.`,
  },

  // ---- Services d'aérodrome ------------------------------------------------
  {
    q: 'QFAAH', prio: 'C', hours: [72, 1440],
    en: (v) => `ATC TWR OPS HR CHANGED TO ${v.hrOpen}-${v.hrClose}.`,
    fr: (v) => `HORAIRES D'OUVERTURE DE LA TWR MODIFIES : ${v.hrOpen}-${v.hrClose}.`,
  },
  {
    q: 'QFAAP', prio: 'B', hours: [48, 720],
    en: () => 'AD AVBL FOR PPR ONLY, CTC OPS PRIOR TO ARR.',
    fr: () => "AD DISPONIBLE SUR PPR UNIQUEMENT, CONTACTER LES OPS AVANT L'ARRIVEE.",
  },
  {
    q: 'QFAXX', prio: 'C', hours: [72, 1440],
    en: () => 'AD SLOT COORDINATED, PRIOR SLOT APPROVAL REQUIRED FOR ALL OPS.',
    fr: () => 'AD A CRENEAUX COORDONNES, ACCORD PREALABLE OBLIGATOIRE POUR TOUTES LES OPERATIONS.',
  },
  {
    q: 'QFAXX', prio: 'A', hours: [6, 240],
    en: () => 'ATC SVC PROVIDED BY MOBILE TWR DUE TO TWR OUT OF SVC.',
    fr: () => 'SERVICE ATC ASSURE PAR TOUR MOBILE, TOUR DE CONTROLE HORS SERVICE.',
  },
  {
    q: 'QFAXX', prio: 'C', hours: [72, 1440],
    en: () => 'DEICING FACILITY OPERATIONAL, EXPECT DELAYS DUE TO DEMAND.',
    fr: () => 'INSTALLATION DE DEGIVRAGE EN SERVICE, DELAIS A PREVOIR EN RAISON DE LA DEMANDE.',
  },
  {
    q: 'QFAAU', prio: 'C', hours: [72, 720],
    en: () => 'CUSTOMS AND IMMIGRATION SVC NOT AVBL AFTER 2200 LT.',
    fr: () => 'SERVICES DOUANE ET IMMIGRATION NON DISPONIBLES APRES 2200 LT.',
  },
  {
    q: 'QFAAU', prio: 'B', hours: [24, 480],
    en: () => 'EMERGENCY LANDING AREA UNAVBL DUE TO GROUND WORK.',
    fr: () => "AIRE D'ATTERRISSAGE DE SECOURS INDISPONIBLE POUR TRAVAUX AU SOL.",
  },
  {
    q: 'QFAAU', prio: 'C', hours: [48, 480],
    en: () => 'DANGEROUS GOODS HANDLING FACILITY TEMPORARILY SUSPENDED.',
    fr: () => 'INSTALLATION DE TRAITEMENT DES MARCHANDISES DANGEREUSES TEMPORAIREMENT SUSPENDUE.',
  },
  {
    q: 'QFUAU', prio: 'B', hours: [24, 336],
    en: (v) => `${v.fuel} NOT AVBL DUE TO SUPPLY SHORTAGE.`,
    fr: (v) => `${v.fuel} NON DISPONIBLE EN RAISON D'UNE RUPTURE D'APPROVISIONNEMENT.`,
  },
  {
    q: 'QFFAH', prio: 'B', hours: [24, 480],
    en: (v) => `AD RFF CATEGORY DOWNGRADED TO CAT ${v.rff}.`,
    fr: (v) => `NIVEAU DE PROTECTION SSLIA DE L'AD ABAISSE A LA CAT ${v.rff}.`,
  },
  {
    q: 'QCAXX', prio: 'B', hours: [168, 2160],
    en: (v) => `${v.svc} FREQ CHANGED TO ${v.freq} MHZ.`,
    fr: (v) => `FREQUENCE ${v.svc} MODIFIEE : ${v.freq} MHZ.`,
  },
];

/** Échappe une chaîne pour un littéral PostgreSQL de type E'...'. */
function sqlStr(text: string): string {
  return `E'${text.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n')}'`;
}

const pad = (n: number) => String(n).padStart(4, '0');
const iso = (d: Date) => `${d.toISOString().slice(0, 19).replace('T', ' ')}+00`;

// Étalement : un NOTAM toutes les ~8h45 sur un an, à partir du 01/09/2026.
const START = Date.UTC(2026, 8, 1);
const SPAN_MS = 365 * 24 * 3600 * 1000;
const STEP_MS = SPAN_MS / TOTAL;
/** La page purge les NOTAM non permanents dont au_at est antérieur à now-3j. */
const MIN_AU = Date.UTC(2026, 8, 8);

type Row = {
  identifiant: string; code: string; du: string; au: string;
  e: string; q: string; prio: string; refFr: string | null;
};

const english: Row[] = [];
const french: Row[] = [];
const counters = new Map<string, number>();

for (let i = 0; i < TOTAL; i++) {
  const terrain = TERRAINS[i % TERRAINS.length];

  // La piste est tirée avant le gabarit : certains gabarits exigent une piste
  // au départ possible (TORA non nul).
  const rwy = terrain.rwy.length ? pick(terrain.rwy) : null;

  const usable = TEMPLATES.filter((t) => {
    if (t.needs === 'rwy') return rwy !== null;
    if (t.needs === 'tora') return rwy !== null && rwy.toraFt > 0 && rwy.declaredDistances !== false;
    if (t.needs === 'twy') return terrain.twy.length > 0;
    return true;
  });
  const tpl = pick(usable);

  // Distances déclarées : 55 à 85 % de la longueur réelle, pieds convertis en
  // mètres puis arrondis à la dizaine. Jamais plus long que la piste.
  const toraM = rwy ? Math.round((rwy.toraFt * FT_TO_M * int(55, 85)) / 1000) * 10 : 0;

  const milBase = int(0, 50) * 100;
  const vars: Vars = {
    rwy: rwy?.name ?? '',
    twy: terrain.twy.length ? pick(terrain.twy) : '',
    stand: int(1, 60),
    gate: int(1, 40),
    rff: int(3, 9),
    snow: int(2, 10),
    tora: toraM,
    obstHgt: int(2, 38) * 10,
    obstDist: int(1, 8),
    obstBrg: String(int(1, 359)).padStart(3, '0'),
    craneHgt: int(2, 35) * 10,
    uasDist: int(1, 5),
    uasAlt: int(2, 4) * 100,
    fl: pick([80, 100, 120, 150]),
    milBase,
    milTop: milBase + int(20, 80) * 100,
    hrOpen: `${String(int(4, 8)).padStart(2, '0')}00`,
    hrClose: `${int(18, 23)}00`,
    navaid: pick(NAVAIDS),
    fuel: pick(FUELS),
    svc: pick(SERVICES),
    freq: pick(FREQS),
  };

  const du = new Date(START + i * STEP_MS + Math.floor(rnd() * STEP_MS));
  const durH = int(tpl.hours[0], tpl.hours[1]);
  const au = new Date(Math.max(du.getTime() + durH * 3600 * 1000, MIN_AU));

  const n = (counters.get(terrain.code) ?? FIRST_NUMBER - 1) + 1;
  counters.set(terrain.code, n);
  const yy = String(du.getUTCFullYear()).slice(2);

  const idEn = `${terrain.code}-A${pad(n)}/${yy}`;
  const idFr = `${terrain.code}-F${pad(n)}/${yy}`;
  const q = `PTFS/${tpl.q}/IV/NBO/A/000/999/${terrain.code}`;
  const shared = { code: terrain.code, du: iso(du), au: iso(au), q, prio: tpl.prio };

  english.push({ identifiant: idEn, ...shared, e: tpl.en(vars), refFr: idFr });
  french.push({ identifiant: idFr, ...shared, e: tpl.fr(vars), refFr: null });
}

/** Lignes prêtes à insérer, pour les outils qui écrivent en base sans passer par le SQL. */
export const NOTAMS = { english, french };

function tuple(r: Row): string {
  return `('${r.identifiant}', '${r.code}', '${r.du}', '${r.au}', '${r.code}', ${sqlStr(r.e)}, '${r.q}', '${r.prio}', ${r.refFr ? `'${r.refFr}'` : 'NULL'}, false)`;
}

const header = `-- ============================================================================
-- Seed : ${TOTAL * 2} NOTAMs PTFS (${TOTAL} anglais + ${TOTAL} francais)
--   - repartis equitablement sur les ${TERRAINS.length} aerodromes PTFS
--   - etales du 01/09/2026 au 31/08/2027
--   - identifiants {OACI}-A{NNNN}/{YY} (EN) et {OACI}-F{NNNN}/{YY} (FR)
--   - reference_fr pointe, sur chaque NOTAM anglais, vers son equivalent francais
--
-- Genere par scripts/generate-notams-ptfs.ts (sortie deterministe).
-- Reutilisable : ON CONFLICT (identifiant) DO NOTHING. Heures en UTC.
-- ============================================================================

INSERT INTO public.notams
  (identifiant, code_aeroport, du_at, au_at, champ_a, champ_e, champ_q, priorite, reference_fr, annule)
VALUES
`;

const body = [
  '-- ==== VERSIONS ANGLAISES ====================================================',
  ...english.map((r) => `${tuple(r)},`),
  '-- ==== VERSIONS FRANCAISES ===================================================',
  ...french.map((r, i) => tuple(r) + (i === french.length - 1 ? '' : ',')),
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}${body}\nON CONFLICT (identifiant) DO NOTHING;\n`, 'utf8');

console.log(`${OUT}`);
console.log(`${english.length} EN + ${french.length} FR = ${english.length + french.length} lignes`);
console.log(`par aerodrome : ${TERRAINS.map((t) => `${t.code}=${(counters.get(t.code) ?? 0) - FIRST_NUMBER + 1}`).join(' ')}`);
