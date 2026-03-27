export const ALL_GAMES = [
  'inspection',
  'calibrage',
  'assemblage',
  'test_moteur',
  'cablage',
  'hydraulique',
  'soudure',
  'diagnostic',
] as const;

export type GameType = (typeof ALL_GAMES)[number];

export const GAMES_PER_REPAIR = 4;

/**
 * Sélection déterministe de 4 jeux à partir de l'ID de demande.
 * Même ID = toujours les mêmes 4 jeux dans le même ordre.
 */
export function getGamesForDemande(demandeId: string): GameType[] {
  let hash = 0;
  for (let i = 0; i < demandeId.length; i++) {
    hash = ((hash << 5) - hash + demandeId.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const pool = [...ALL_GAMES];
  const selected: GameType[] = [];

  for (let i = 0; i < GAMES_PER_REPAIR; i++) {
    const idx = hash % pool.length;
    selected.push(pool[idx]);
    pool.splice(idx, 1);
    hash = Math.abs(((hash << 5) - hash + (i + 1) * 7919) | 0);
  }

  return selected;
}
