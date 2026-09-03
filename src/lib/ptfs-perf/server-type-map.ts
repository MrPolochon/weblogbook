import { getAircraftData } from './utils';

/** Types PTFS avec données de performance (cityuser). */
const PERF_TYPES = [
  'Airbus A320',
  'Airbus A330',
  'Airbus A380',
  'Airbus A350',
  'Airbus A220',
  'Boeing 737',
  'Boeing 777',
  'Boeing 787',
  'Boeing 747',
  'ATR-72',
  'Embraer E190',
] as const;

/**
 * Mapping explicite nom serveur → type PTFS (pour variantes sans correspondance exacte).
 * Les noms sont normalisés en minuscules pour la clé.
 */
const SERVER_TO_PERF: Record<string, string> = {
  'atr 72': 'ATR-72',
  'atr 72f': 'ATR-72',
  'atr-72': 'ATR-72',
  'airbus a320': 'Airbus A320',
  'airbus a320neo': 'Airbus A320',
  'airbus a321': 'Airbus A320',
  'airbus a330': 'Airbus A330',
  'airbus a330 cargo': 'Airbus A330',
  'airbus a330 mrtt': 'Airbus A330',
  'airbus a340': 'Airbus A330',
  'airbus a350': 'Airbus A350',
  'airbus a380': 'Airbus A380',
  'airbus a220': 'Airbus A220',
  'boeing 737': 'Boeing 737',
  'boeing 737 cargo': 'Boeing 737',
  'boeing 737-800': 'Boeing 737',
  'boeing 737-700': 'Boeing 737',
  'boeing 747': 'Boeing 747',
  'boeing 747 cargo': 'Boeing 747',
  'boeing 777': 'Boeing 777',
  'boeing 777 cargo': 'Boeing 777',
  'boeing 787': 'Boeing 787',
  'embraer e190': 'Embraer E190',
  'embraer e195': 'Embraer E190',
};

/** Types trop éloignés d’un type PTFS pour un proxy fiable (pas de 757→737, 767→787, CRJ/Q400). */
const DISTANT_PROXY_KEYS = new Set([
  'boeing 757',
  'boeing 757 cargo',
  'boeing 767',
  'boeing 767 cargo',
  'bombardier crj700',
  'bombardier q400',
]);

export type PerfMappingInfo = {
  perfType: string | null;
  mapped: boolean;
  refused: boolean;
};

function isDistantProxyKey(value: string): boolean {
  return DISTANT_PROXY_KEYS.has(value);
}

/**
 * Retourne le type PTFS (clé des données de performance) à partir du nom d'avion du serveur.
 * Si le type n'a pas de données de performance, retourne null.
 */
export function getPerfTypeFromServerNom(serverNom: string): string | null {
  return getPerfMappingInfo(serverNom).perfType;
}

/** Mapping serveur → type PTFS, avec indication si c’est un équivalent (pas le type exact). */
export function getPerfMappingInfo(serverNom: string): PerfMappingInfo {
  if (!serverNom || !serverNom.trim()) return { perfType: null, mapped: false, refused: false };
  const normalized = serverNom.trim();
  if (getAircraftData(normalized)) return { perfType: normalized, mapped: false, refused: false };
  const key = normalized.toLowerCase();
  const base = key.replace(/\s*[-–]\s*\w+$/, '').replace(/\s*(neo|max|er|lr|xl)\s*$/i, '').trim();
  const family = key.replace(/\s*[-–]\s*\d+.*$/, '').trim();
  if (isDistantProxyKey(key) || isDistantProxyKey(base) || isDistantProxyKey(family)) {
    return { perfType: null, mapped: false, refused: true };
  }
  if (SERVER_TO_PERF[key]) return { perfType: SERVER_TO_PERF[key], mapped: SERVER_TO_PERF[key].toLowerCase() !== key, refused: false };
  if (SERVER_TO_PERF[base]) return { perfType: SERVER_TO_PERF[base], mapped: true, refused: false };
  if (SERVER_TO_PERF[family]) return { perfType: SERVER_TO_PERF[family], mapped: true, refused: false };
  return { perfType: null, mapped: false, refused: false };
}

export function getSupportedPerfTypes(): readonly string[] {
  return PERF_TYPES;
}
