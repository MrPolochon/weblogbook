/** Public in-game feed used by https://aeronav.space/app (verified 2026-11-26).
 * AeroNav derives METAR weather from this ATIS feed; it does not publish TAF.
 * This is deliberately separate from the server's own Discord ATIS source.
 */
export const AERONAV_WEATHER_SOURCE = 'https://ws.awdevsoftware.org/atis';
type WeatherEntry = { airport?: unknown; content?: unknown; lines?: unknown };
type WeatherCache = { expires: number; entries: WeatherEntry[] };
let cache: WeatherCache | null = null;
let pending: Promise<WeatherEntry[]> | null = null;

const upper = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

export function gameMetar(entry: WeatherEntry, airport: string): string | null {
  const raw = typeof entry.content === 'string' ? entry.content
    : Array.isArray(entry.lines) && entry.lines.every(line => typeof line === 'string') ? entry.lines.join('\n') : '';
  const text = upper(raw);
  // Extract only the observed weather, never runway or operational instructions.
  const line = text.split(/\r?\n/).map(value => value.trim()).find(value => /^(?:\d{3}|VRB)\/\d{2,3}(?:G\d{2,3})?\s/.test(value));
  if (!line || !/\b[QA]\d{4}\b/.test(line)) return null;
  const weather = line.replace(/^(\d{3}|VRB)\/(\d{2,3})(G\d{2,3})?/, '$1$2$3KT');
  const time = text.match(/\bTIME\s+([0-2]\d[0-5]\d)Z\b/)?.[1];
  // The source gives HHMM but no observation date. Do not invent DD or claim
  // freshness from a successful fetch; expose the source time and limitation.
  return `${airport} ${time ? `${time}Z` : 'TIME UNKNOWN'} ${weather}\nOBSERVATION DATE NOT PROVIDED BY SOURCE`;
}

async function fetchWeather(): Promise<WeatherEntry[]> {
  if (cache && cache.expires > Date.now()) return cache.entries;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(AERONAV_WEATHER_SOURCE, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length > 500) throw new Error('Invalid weather feed');
    const entries = payload.filter((entry): entry is WeatherEntry => Boolean(entry) && typeof entry === 'object');
    cache = { expires: Date.now() + 60_000, entries };
    return entries;
  })();
  try { return await pending; } finally { pending = null; }
}

export async function requestWeather(airports: string[], kind: 'METAR' | 'TAF'): Promise<string> {
  if (!Array.isArray(airports) || airports.length < 1 || airports.length > 4 || airports.some(code => !/^[A-Z]{4}$/.test(code)) || !['METAR', 'TAF'].includes(kind)) {
    throw new Error('INVALID WEATHER REQUEST');
  }
  if (kind === 'TAF') return airports.map(airport => `${airport}: TAF NOT AVAILABLE — NO FORECAST PUBLISHED BY AERONAV SOURCE`).join('\n\n');
  try {
    const entries = await fetchWeather();
    return ['GAME WEATHER - METAR FORMAT FROM AERONAV SOURCE', ...airports.map(airport => {
      const entry = entries.find(item => typeof item.airport === 'string' && item.airport.toUpperCase() === airport);
      return entry && gameMetar(entry, airport) || `${airport}: METAR NOT AVAILABLE`;
    })].join('\n\n');
  } catch {
    return `WEATHER SERVICE UNAVAILABLE - TRY AGAIN LATER\n${airports.join(' ')}`;
  }
}
