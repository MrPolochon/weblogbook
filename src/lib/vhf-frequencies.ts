/** Virtual radio channels: every XXX.YYY value is available. */
export const VHF_MIN_MHZ = 0;
export const VHF_MAX_MHZ = 999;
export const ALL_VHF_DECIMALS = Array.from({ length: 1000 }, (_, i) => String(i).padStart(3, '0'));
export const TOTAL_VHF_FREQUENCIES = 1_000_000;
export function isValidVhfFrequency(freq: string): boolean { return /^\d{3}\.\d{3}$/.test(freq); }
export function parseFrequency(freq: string): { mhz: number; decimal: string } | null {
  return isValidVhfFrequency(freq) ? { mhz: Number(freq.slice(0, 3)), decimal: freq.slice(4) } : null;
}
export function formatFrequency(mhz: number, decimal: string): string {
  return String(mhz).padStart(3, '0') + '.' + decimal.padStart(3, '0');
}
export function getDecimalIndex(decimal: string): number { return ALL_VHF_DECIMALS.indexOf(decimal); }
export function getMhzRange(): number[] { return Array.from({ length: 1000 }, (_, i) => i); }
export function getMaxDecimalForMhz(_mhz: number): string { return '999'; }
export function getDecimalsForMhz(_mhz: number): string[] { return ALL_VHF_DECIMALS; }
export function stepFrequency(freq: string, part: 'mhz' | 'decimal', direction: number): string {
  const parsed = parseFrequency(freq.trim().replace(',', '.')) || { mhz: 118, decimal: '000' };
  const wrap = (value: number) => ((value + direction) % 1000 + 1000) % 1000;
  return formatFrequency(part === 'mhz' ? wrap(parsed.mhz) : parsed.mhz,
    part === 'decimal' ? String(wrap(Number(parsed.decimal))) : parsed.decimal);
}
export function frequencyToRoomName(freq: string): string { return 'vhf-' + freq.replace('.', ''); }
export function roomNameToFrequency(roomName: string): string | null {
  const match = roomName.match(/^vhf-(\d{3})(\d{3})$/);
  return match ? match[1] + '.' + match[2] : null;
}
