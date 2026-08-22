/** Aéroports Project Flight (codes OACI in-game + calage carte PFTracker). */

export type PfAirport = {
  code: string;
  name: string;
  mapX: number;
  mapY: number;
};

/**
 * Positions en unités carte (240×135, Y vers le bas).
 * Calées sur les clusters d’avions au sol du flux officiel, pas sur les navaids.
 */
export const PF_AIRPORTS: readonly PfAirport[] = [
  { code: 'MDPC', name: 'Punta Cana', mapX: 87.94, mapY: 103.24 },
  { code: 'MDST', name: 'Cibao', mapX: 68.56, mapY: 93.22 },
  { code: 'MDAB', name: 'Arroyo Barril', mapX: 80.27, mapY: 95.51 },
  { code: 'MDCR', name: 'Cabo Rojo', mapX: 57.38, mapY: 109.33 },
  { code: 'MTCA', name: 'Antoine-Simon', mapX: 48.78, mapY: 103.20 },
  { code: 'EGKK', name: 'London Gatwick', mapX: 129.71, mapY: 33.07 },
  { code: 'EGHI', name: 'Southampton', mapX: 126.09, mapY: 38.60 },
  { code: 'GCLP', name: 'Gran Canaria', mapX: 89.33, mapY: 70.03 },
  { code: 'LEMH', name: 'Menorca', mapX: 126.55, mapY: 65.67 },
  { code: 'LYTV', name: 'Tivat', mapX: 145.35, mapY: 100.97 },
  { code: 'EFKT', name: 'Kittilä', mapX: 165.62, mapY: 12.74 },
  { code: 'LCLK', name: 'Larnaca', mapX: 158.99, mapY: 91.31 },
] as const;

const BY_CODE = new Map(PF_AIRPORTS.map((a) => [a.code, a]));

export function getPfAirport(code: string | null | undefined): PfAirport | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}
