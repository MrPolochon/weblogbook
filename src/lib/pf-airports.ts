/** Aéroports Project Flight (codes OACI in-game + calage carte PFTracker). */

export type PfAirport = {
  code: string;
  name: string;
  mapX: number;
  mapY: number;
};

/**
 * Positions en unités carte (240×135, Y vers le bas).
 * Calées sur les navaids / clusters SID du tracker officiel.
 */
export const PF_AIRPORTS: readonly PfAirport[] = [
  { code: 'MDPC', name: 'Punta Cana', mapX: 87.44, mapY: 102.59 },
  { code: 'MDST', name: 'Cibao', mapX: 80.2, mapY: 99.4 },
  { code: 'MDAB', name: 'Arroyo Barril', mapX: 83.1, mapY: 96.8 },
  { code: 'MDCR', name: 'Cabo Rojo', mapX: 78.4, mapY: 107.2 },
  { code: 'MTCA', name: 'Antoine-Simon', mapX: 74.6, mapY: 103.8 },
  { code: 'EGKK', name: 'London Gatwick', mapX: 128.8, mapY: 35.8 },
  { code: 'EGHI', name: 'Southampton', mapX: 118.6, mapY: 39.2 },
  { code: 'GCLP', name: 'Gran Canaria', mapX: 98.4, mapY: 94.6 },
  { code: 'LEMH', name: 'Menorca', mapX: 148.2, mapY: 72.4 },
  { code: 'LYTV', name: 'Tivat', mapX: 156.4, mapY: 64.8 },
  { code: 'EFKT', name: 'Kittilä', mapX: 186.56, mapY: 27.19 },
  { code: 'LCLK', name: 'Larnaca', mapX: 159.82, mapY: 91.21 },
] as const;

const BY_CODE = new Map(PF_AIRPORTS.map((a) => [a.code, a]));

export function getPfAirport(code: string | null | undefined): PfAirport | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}
