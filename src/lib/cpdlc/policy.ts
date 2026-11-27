import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { AIRPORT_TO_FIR } from '@/lib/cartography-data';
import { TMA_CORE_BY_FIR, TMA_SATELLITES_BY_FIR } from '@/lib/atis-priority';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';
import type { CpdlcInit, CpdlcStation } from './types';

export class CpdlcError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const ACTIVE_PLANS = ['depose', 'en_attente', 'en_attente_copilote', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause'];
export function displayText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^\x20-\x7E\n]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
export function stationCode(value: unknown): string { return displayText(value).replace(/\s+/g, ''); }
export function requiredText(value: unknown, name: string, max = 1500): string {
  if (typeof value !== 'string') throw new CpdlcError(`${name} REQUIRED`);
  const text = displayText(value);
  if (!text || text.length > max) throw new CpdlcError(`${name} REQUIRED (MAX ${max} CHARACTERS)`);
  return text;
}
export function airportCode(value: unknown): string {
  const code = stationCode(value);
  if (!CODES_OACI_VALIDES.has(code)) throw new CpdlcError('INVALID AIRPORT');
  return code;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new CpdlcError('INVALID IDENTIFIER');
  return value;
}
export function validateInit(raw: unknown): CpdlcInit {
  if (!raw || typeof raw !== 'object') throw new CpdlcError('INIT DATA REQUIRED');
  const value = raw as Record<string, unknown>;
  const init: CpdlcInit = { flight_no: stationCode(requiredText(value.flight_no, 'FLT NO', 16)), dep: airportCode(value.dep), dest: airportCode(value.dest),
    altn: value.altn ? airportCode(value.altn) : '', ete: requiredText(value.ete, 'ETE', 4), utc: requiredText(value.utc, 'UTC', 4), date: requiredText(value.date, 'DATE', 10) };
  if (!/^\d{2}[0-5]\d$/.test(init.ete)) throw new CpdlcError('ETE FORMAT HHMM');
  if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(init.utc)) throw new CpdlcError('UTC FORMAT HHMM');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(init.date)) throw new CpdlcError('DATE FORMAT DD/MM/YYYY');
  const [day, month, year] = init.date.split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new CpdlcError('INVALID DATE');
  return init;
}
export function coversAirport(station: CpdlcStation, airport: string): boolean {
  if (station.code === airport) return true;
  if (!['DEP', 'APP', 'Center'].includes(station.position)) return false;
  const fir = AIRPORT_TO_FIR[station.code];
  if (!fir || fir !== AIRPORT_TO_FIR[airport]) return false;
  return station.position === 'Center' || [...(TMA_CORE_BY_FIR[fir] ?? []), ...(TMA_SATELLITES_BY_FIR[fir] ?? [])].includes(airport);
}
const PRIORITY = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'];
export function routeStation(stations: CpdlcStation[], airport: string, clearance: boolean): CpdlcStation | null {
  const candidates = stations.filter(s => PRIORITY.includes(s.position) && coversAirport(s, airport));
  candidates.sort((a, b) => {
    if (clearance) {
      const priority = PRIORITY.indexOf(a.position) - PRIORITY.indexOf(b.position);
      if (priority) return priority;
      const local = Number(b.code === airport) - Number(a.code === airport);
      if (local) return local;
    }
    return Date.parse(a.started_at) - Date.parse(b.started_at) || a.session_id.localeCompare(b.session_id);
  });
  return candidates[0] ?? null;
}
export function clearanceText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new CpdlcError('CLEARANCE DATA REQUIRED');
  const c = raw as Record<string, unknown>;
  const destination = airportCode(c.destination), departure = requiredText(c.departure, 'DEPARTURE', 120);
  const altitude = requiredText(c.altitude, 'ALTITUDE', 12).replace(/\s+/g, '');
  if (!/^(FL\d{3}|[1-9]\d{1,4}FT)$/.test(altitude)) throw new CpdlcError('ALTITUDE FORMAT 5000 FT OR FL050');
  const squawk = requiredText(c.squawk, 'SQUAWK', 4);
  if (!/^[0-7]{4}$/.test(squawk)) throw new CpdlcError('SQUAWK MUST BE FOUR OCTAL DIGITS');
  const frequency = requiredText(c.frequency, 'FREQUENCY', 7).replace(',', '.');
  if (!isValidVhfFrequency(frequency)) throw new CpdlcError('INVALID VHF FREQUENCY');
  const departureLine = /^(EXPECT VECTORS|DIRECT\b)/.test(departure) ? departure : `${departure} DEPARTURE`;
  return `CLD TO ${destination}.\n${departureLine}.\nMNTN ${altitude.replace(/FT$/, ' FT')}.\nDPRTR ON ${frequency} SQUAWK ${squawk}${c.text ? `\n${requiredText(c.text, 'TEXT', 1000)}` : ''}`;
}
