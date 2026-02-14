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

/**
 * Génère les 160 décimales valides par MHz.
 * Pattern : dans chaque bloc de 25 (ex 000-040, 050-090, 100-140…)
 * les valeurs valides sont +0, +5, +10, +15, +25, +30, +35, +40
 * (on saute +20 et +45 → en réalité +20 est à la fin du bloc précédent)
 *
 * Concrètement les décimales invalides (à exclure) sont celles qui
 * finissent par 020, 045, 070, 095 dans chaque centaine.
 */
function generateDecimals(): string[] {
  const decimals: string[] = [];
  // Pattern par bloc de 50 : 0,5,10,15,25,30,35,40
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

/** Les 160 décimales valides (ex: '000', '005', …, '990') */
export const ALL_VHF_DECIMALS: string[] = generateDecimals();

/** Toutes les fréquences VHF valides sous forme de Set pour lookup rapide */
const ALL_FREQUENCIES_SET: Set<string> = (() => {
  const set = new Set<string>();
  for (let mhz = VHF_MIN_MHZ; mhz <= VHF_MAX_MHZ; mhz++) {
    for (const dec of ALL_VHF_DECIMALS) {
      const freq = `${mhz}.${dec}`;
      // 132.975 est le max
      if (mhz === VHF_MAX_MHZ) {
        const decNum = parseInt(dec, 10);
        if (decNum > 975) continue;
      }
      set.add(freq);
    }
  }
  return set;
})();

/** Nombre total de fréquences valides */
export const TOTAL_VHF_FREQUENCIES = ALL_FREQUENCIES_SET.size;

/** Vérifie si une fréquence est valide (format XXX.YYY, dans la plage) */
export function isValidVhfFrequency(freq: string): boolean {
  return ALL_FREQUENCIES_SET.has(freq);
}

/** Parse une fréquence en { mhz, decimal } */
export function parseFrequency(freq: string): { mhz: number; decimal: string } | null {
  const match = freq.match(/^(\d{3})\.(\d{3})$/);
  if (!match) return null;
  const mhz = parseInt(match[1], 10);
  const decimal = match[2];
  if (mhz < VHF_MIN_MHZ || mhz > VHF_MAX_MHZ) return null;
  if (!ALL_VHF_DECIMALS.includes(decimal)) return null;
  return { mhz, decimal };
}

/** Formate une fréquence à partir de MHz et décimale */
export function formatFrequency(mhz: number, decimal: string): string {
  return `${mhz}.${decimal}`;
}

/** Retourne l'index d'une décimale dans ALL_VHF_DECIMALS (-1 si invalide) */
export function getDecimalIndex(decimal: string): number {
  return ALL_VHF_DECIMALS.indexOf(decimal);
}

/** Retourne le tableau des MHz valides [118, 119, …, 132] */
export function getMhzRange(): number[] {
  const range: number[] = [];
  for (let i = VHF_MIN_MHZ; i <= VHF_MAX_MHZ; i++) range.push(i);
  return range;
}

/** Retourne la décimale max pour un MHz donné (990 pour 118-131, 975 pour 132) */
export function getMaxDecimalForMhz(mhz: number): string {
  if (mhz === VHF_MAX_MHZ) return '975';
  return ALL_VHF_DECIMALS[ALL_VHF_DECIMALS.length - 1];
}

/** Retourne les décimales valides pour un MHz donné */
export function getDecimalsForMhz(mhz: number): string[] {
  if (mhz === VHF_MAX_MHZ) {
    return ALL_VHF_DECIMALS.filter(d => parseInt(d, 10) <= 975);
  }
  return ALL_VHF_DECIMALS;
}

/**
 * Convertit une fréquence en nom de room LiveKit.
 * Ex: "118.935" → "vhf-118935"
 */
export function frequencyToRoomName(freq: string): string {
  return `vhf-${freq.replace('.', '')}`;
}

/**
 * Convertit un nom de room LiveKit en fréquence.
 * Ex: "vhf-118935" → "118.935"
 */
export function roomNameToFrequency(roomName: string): string | null {
  const match = roomName.match(/^vhf-(\d{3})(\d{3})$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}
