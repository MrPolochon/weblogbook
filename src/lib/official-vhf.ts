/** Official community assignments supplied on 24 November 2026 (PTFS network). */
export type RadioAssignment = { id: string; aeroport: string; position: string; frequency: string; official?: boolean };
// AFIS duplicates separated on 26 November 2026; each AFIS has its own channel.
const stations: Record<string, Record<string, string>> = {
  IRFD: { Center: '125.050', APP: '120.775', Tower: '118.925', DEP: '121.985', Ground: '121.700', Delivery: '118.455' },
  IMLR: { APP: '125.700', Tower: '125.800', Ground: '125.225' },
  ITRC: { Tower: '119.075', Ground: '121.725' },
  IBTH: { AFIS: '127.825' },
  ITKO: { Center: '124.850', APP: '124.200', Tower: '118.100', Ground: '121.700' },
  IDCS: { AFIS: '127.850' },
  IPPH: { Center: '125.455', APP: '118.700', Tower: '127.400', Ground: '121.700' },
  ILKL: { AFIS: '127.875' },
  IZOL: { Center: '125.640', APP: '124.300', Tower: '119.150', Ground: '121.750' },
  IJAF: { AFIS: '127.900' },
  ISCM: { AFIS: '127.925' },
  ILAR: { Center: '127.525', APP: '119.950', Tower: '122.900', Ground: '122.225' },
  IPAP: { APP: '120.150', Tower: '118.575', Ground: '121.650' },
  IIAB: { APP: '120.850', Tower: '118.100', Ground: '121.300' },
  IHEN: { AFIS: '124.975' },
  ISAU: { Center: '123.000', APP: '123.100', Tower: '123.200', Ground: '123.300' },
  IKFL: { Center: '126.100', APP: '126.700', Tower: '126.800', Ground: '126.225' },
  ITEY: { AFIS: '127.950' },
};

// Dedicated RAMP allocation: 131.000–131.625, 25 kHz spacing. Keep this order stable.
// No assignments in this block were present in the supplied list or repository seeds.
export const RAMP_AIRPORTS = ['IRFD', 'IMLR', 'ITRC', 'IBTH', 'ITKO', 'IDCS', 'IPPH', 'ILKL',
  'IZOL', 'IJAF', 'ISCM', 'ILAR', 'IPAP', 'IIAB', 'IHEN', 'ISAU', 'IKFL', 'ITEY',
  'IBLT', 'ISKP', 'IBAR', 'IBRD', 'IUFO', 'IGAR', 'IGFD', 'IQEL'] as const;
export const RAMP_FREQUENCIES: Readonly<Record<string, string>> = Object.fromEntries(
  RAMP_AIRPORTS.map((airport, index) => [airport, ((131000 + index * 25) / 1000).toFixed(3)]),
);

export function normalizeRadioPosition(position: string): string {
  const value = position.trim().toUpperCase();
  const aliases: Record<string, string> = { DELIVERY: 'Delivery', CLAIRANCE: 'Delivery', DEL: 'Delivery',
    GROUND: 'Ground', GND: 'Ground', TOWER: 'Tower', TWR: 'Tower', APPROACH: 'APP', APP: 'APP',
    DEPARTURE: 'DEP', DEP: 'DEP', CENTER: 'Center', CENTRE: 'Center', CTR: 'Center', AFIS: 'AFIS', RAMP: 'RAMP' };
  return aliases[value] ?? position.trim();
}
export function getOfficialFrequency(airport: string, position: string): string | null {
  const code = airport.trim().toUpperCase();
  const service = normalizeRadioPosition(position);
  return (service === 'RAMP' ? RAMP_FREQUENCIES[code] : stations[code]?.[service]) ?? null;
}
export function hasOfficialAirport(airport: string): boolean {
  return Object.prototype.hasOwnProperty.call(stations, airport.trim().toUpperCase());
}
export function isOfficialAssignment(airport: string, position: string): boolean {
  return hasOfficialAirport(airport) || (normalizeRadioPosition(position) === 'RAMP' && Boolean(RAMP_FREQUENCIES[airport.trim().toUpperCase()]));
}
export const OFFICIAL_VHF_ASSIGNMENTS: readonly RadioAssignment[] = [
  ...Object.entries(stations).flatMap(([aeroport, positions]) => Object.entries(positions).map(([position, frequency]) =>
    ({ id: `official:${aeroport}:${position}`, aeroport, position, frequency, official: true }))),
  ...Object.entries(RAMP_FREQUENCIES).map(([aeroport, frequency]) =>
    ({ id: `official:${aeroport}:RAMP`, aeroport, position: 'RAMP', frequency, official: true })),
];
/** Retire stale allocations at airports covered by the official list; retain other local assignments. */
export function publishedRadioAssignments(stored: RadioAssignment[]): RadioAssignment[] {
  return [...stored.filter(entry => !isOfficialAssignment(entry.aeroport, entry.position)), ...OFFICIAL_VHF_ASSIGNMENTS]
    .sort((a, b) => a.aeroport.localeCompare(b.aeroport) || a.position.localeCompare(b.position));
}
