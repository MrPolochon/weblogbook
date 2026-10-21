export const ATC_POSITIONS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center'] as const;
export type AtcPosition = (typeof ATC_POSITIONS)[number];

/** Display name only; airport codes and position identifiers remain routing keys. */
export function atcStationLabel(aeroport: string, position: string, fallback: string): string {
  return aeroport.trim().toUpperCase() === 'IZOL' && position === 'Center'
    ? 'Norsom Center'
    : fallback;
}
