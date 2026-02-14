/**
 * VHF Aviation Frequencies — espacement 8.33 kHz
 *
 * Plage : 118.000 → 132.975
 * MHz   : 118 à 132 (15 valeurs)
 * Décimales par MHz : 160 valeurs (000, 005, 010, 015, 025, 030, …, 990)
 *   → on exclut .020, .045, .070, .095 et leurs équivalents dans chaque bloc de 100
 *
 * Fréquence maximale : 132.975
 */

export const VHF_MIN_MHZ = 118;
export const VHF_MAX_MHZ = 132;

function generateDecimals(): string[] {
  const decimals: string[] = [];
  const blockPattern = [0, 5, 10, 15, 25, 30, 35, 40];

  for (let centaine = 0; centaine <= 9; centaine++) {
    for (let demiCentaine = 0; demiCentaine < 2; demiCentaine++) {
      const base = centaine * 100 + demiCentaine * 50;
      for (const offset of blockPattern) {
        const val = base + offset;
        if (val > 999) break;
        decimals.push(String(val).padStart(3, '0'));
      }
    }
  }
  return decimals;
}

export const ALL_VHF_DECIMALS: string[] = generateDecimals();

const ALL_FREQUENCIES_SET: Set<string> = (() => {
  const set = new Set<string>();
  for (let mhz = VHF_MIN_MHZ; mhz <= VHF_MAX_MHZ; mhz++) {
    for (const dec of ALL_VHF_DECIMALS) {
      const freq = `${mhz}.${dec}`;
      if (mhz === VHF_MAX_MHZ) {
        const decNum = parseInt(dec, 10);
        if (decNum > 975) continue;
      }
      set.add(freq);
    }
  }
  return set;
})();

export const TOTAL_VHF_FREQUENCIES = ALL_FREQUENCIES_SET.size;

export function isValidVhfFrequency(freq: string): boolean {
  return ALL_FREQUENCIES_SET.has(freq);
}

export function parseFrequency(freq: string): { mhz: number; decimal: string } | null {
  const match = freq.match(/^(\d{3})\.(\d{3})$/);
  if (!match) return null;
  const mhz = parseInt(match[1], 10);
  const decimal = match[2];
  if (mhz < VHF_MIN_MHZ || mhz > VHF_MAX_MHZ) return null;
  if (!ALL_VHF_DECIMALS.includes(decimal)) return null;
  return { mhz, decimal };
}

export function formatFrequency(mhz: number, decimal: string): string {
  return `${mhz}.${decimal}`;
}

export function getDecimalIndex(decimal: string): number {
  return ALL_VHF_DECIMALS.indexOf(decimal);
}

export function getMhzRange(): number[] {
  const range: number[] = [];
  for (let i = VHF_MIN_MHZ; i <= VHF_MAX_MHZ; i++) range.push(i);
  return range;
}

export function getMaxDecimalForMhz(mhz: number): string {
  if (mhz === VHF_MAX_MHZ) return '975';
  return ALL_VHF_DECIMALS[ALL_VHF_DECIMALS.length - 1];
}

export function getDecimalsForMhz(mhz: number): string[] {
  if (mhz === VHF_MAX_MHZ) {
    return ALL_VHF_DECIMALS.filter(d => parseInt(d, 10) <= 975);
  }
  return ALL_VHF_DECIMALS;
}

export function frequencyToRoomName(freq: string): string {
  return `vhf-${freq.replace('.', '')}`;
}

export function roomNameToFrequency(roomName: string): string | null {
  const match = roomName.match(/^vhf-(\d{3})(\d{3})$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}
