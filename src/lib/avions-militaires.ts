/**
 * Liste fixe des avions utilisables pour les vols militaires (Espace militaire).
 * Tri alphabétique pour l'affichage.
 */
export const AVIONS_MILITAIRES = [
  'A1-0 WARTHOG',
  'A6-M',
  'AVRO VULCAN',
  'AWK T-1',
  'B-2',
  'B-29',
  'blackbird',
  'BOEING P8',
  'C-130',
  'E-3 SENTRY',
  'EC18B',
  'ENGLISH ELECTRIC LIGHTNING',
  'EUROFIGHTER TYPHOON',
  'F-14',
  'F-15',
  'F-16',
  'F-18',
  'F-22',
  'F-35',
  'F-4',
  'F-4U',
  'FOKKER DR-1',
  'FU-27',
  'hurrican',
  'JAS-39',
  'mig-15',
  'P-38',
  'P-51 mustang',
  'SU-57',
  'VTOL',
] as const;

export type NomAvionMilitaire = (typeof AVIONS_MILITAIRES)[number];

export const NATURES_VOL_MILITAIRE = [
  'entrainement',
  'escorte',
  'sauvetage',
  'reconnaissance',
  'autre',
] as const;

export type NatureVolMilitaire = (typeof NATURES_VOL_MILITAIRE)[number];
