/** Aviation COM channel designators (25 / 8.33 kHz), freely tunable without a station directory. */
export const VHF_MIN_MHZ = 118;
export const VHF_MAX_MHZ = 136;
const CHANNEL_OFFSETS = [0, 5, 10, 15, 25, 30, 35, 40];
export const ALL_VHF_DECIMALS = Array.from({ length: 20 }, (_, block) =>
  CHANNEL_OFFSETS.map(offset => String(block * 50 + offset).padStart(3, '0'))).flat();
export const TOTAL_VHF_FREQUENCIES = (VHF_MAX_MHZ - VHF_MIN_MHZ + 1) * ALL_VHF_DECIMALS.length;
export function isValidVhfFrequency(freq: string): boolean {
  return /^\d{3}\.\d{3}$/.test(freq) && Number(freq.slice(0, 3)) >= VHF_MIN_MHZ &&
    Number(freq.slice(0, 3)) <= VHF_MAX_MHZ && ALL_VHF_DECIMALS.includes(freq.slice(4));
}
export function parseFrequency(freq: string): { mhz: number; decimal: string } | null {
  return isValidVhfFrequency(freq) ? { mhz: Number(freq.slice(0, 3)), decimal: freq.slice(4) } : null;
}
export function formatFrequency(mhz: number, decimal: string): string {
  return String(mhz).padStart(3, '0') + '.' + decimal.padStart(3, '0');
}
export function getDecimalIndex(decimal: string): number { return ALL_VHF_DECIMALS.indexOf(decimal); }
export function getMhzRange(): number[] { return Array.from({ length: VHF_MAX_MHZ - VHF_MIN_MHZ + 1 }, (_, i) => VHF_MIN_MHZ + i); }
export function getMaxDecimalForMhz(_mhz: number): string { return '990'; }
export function getDecimalsForMhz(_mhz: number): string[] { return ALL_VHF_DECIMALS; }
export function stepFrequency(freq: string, part: 'mhz' | 'decimal', direction: number): string {
  const parsed = parseFrequency(freq.trim().replace(',', '.')) || { mhz: 118, decimal: '000' };
  const wrap = (index: number, length: number) => ((index + Math.sign(direction)) % length + length) % length;
  return formatFrequency(part === 'mhz' ? VHF_MIN_MHZ + wrap(parsed.mhz - VHF_MIN_MHZ, VHF_MAX_MHZ - VHF_MIN_MHZ + 1) : parsed.mhz,
    part === 'decimal' ? ALL_VHF_DECIMALS[wrap(getDecimalIndex(parsed.decimal), ALL_VHF_DECIMALS.length)] : parsed.decimal);
}
export function frequencyToRoomName(freq: string): string { return 'vhf-' + freq.replace('.', ''); }
export function roomNameToFrequency(roomName: string): string | null {
  const match = roomName.match(/^vhf-(\d{3})(\d{3})$/);
  return match ? match[1] + '.' + match[2] : null;
}
