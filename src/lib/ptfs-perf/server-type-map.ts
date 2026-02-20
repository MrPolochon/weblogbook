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
  'boeing 757': 'Boeing 737',
  'boeing 757 cargo': 'Boeing 737',
  'boeing 767': 'Boeing 787',
  'boeing 767 cargo': 'Boeing 787',
  'boeing 777': 'Boeing 777',
  'boeing 777 cargo': 'Boeing 777',
  'boeing 787': 'Boeing 787',
  'embraer e190': 'Embraer E190',
  'embraer e195': 'Embraer E190',
  'bombardier crj700': 'Embraer E190',
  'bombardier q400': 'ATR-72',
};

/**
 * Retourne le type PTFS (clé des données de performance) à partir du nom d'avion du serveur.
 * Si le type n'a pas de données de performance, retourne null.
 */
export function getPerfTypeFromServerNom(serverNom: string): string | null {
  if (!serverNom || !serverNom.trim()) return null;
  const normalized = serverNom.trim();
  if (getAircraftData(normalized)) return normalized;
  const key = normalized.toLowerCase();
  if (SERVER_TO_PERF[key]) return SERVER_TO_PERF[key];
  const base = key.replace(/\s*[-–]\s*\w+$/, '').replace(/\s*(neo|max|er|lr|xl)\s*$/i, '').trim();
  if (SERVER_TO_PERF[base]) return SERVER_TO_PERF[base];
  const family = key.replace(/\s*[-–]\s*\d+.*$/, '').trim();
  if (SERVER_TO_PERF[family]) return SERVER_TO_PERF[family];
  return null;
}

export function getSupportedPerfTypes(): readonly string[] {
  return PERF_TYPES;
}
