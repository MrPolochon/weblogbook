/** Les instants sont stockés en UTC (timestamptz). Affichage : UTC d’abord, locale entre parenthèses. */

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** `datetime-local` value from UTC wall-clock (`YYYY-MM-DDTHH:mm`). */
export function utcIsoToUtcInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Parse a timezone-naive `datetime-local` value as UTC (19:00 → 19:00Z). */
export function utcInputToUtcIso(input: string): string | null {
  if (!input) return null;
  const t = String(input).trim().replace(' ', 'T');
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:${(m[6] || '00').padStart(2, '0')}.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse « YYYY-MM-DD HH:MM » ou « YYYY-MM-DDTHH:MM » comme UTC (saisie Discord). */
export function parseUtcDateTime(raw: string): string | null {
  const t = String(raw || '').trim().replace('T', ' ').replace('/', '-');
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `19H` ou `19H30` (UTC, 24 h). */
export function formatUtcClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return m === 0 ? `${h}H` : `${h}H${pad2(m)}`;
}

/** `7h` ou `7h30` (fuseau de l’appareil). */
export function formatLocalClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}h` : `${h}h${pad2(m)}`;
}

/** `19H UTC (7h Local)` */
export function formatEventTime(iso: string): string {
  return `${formatUtcClock(iso)} UTC (${formatLocalClock(iso)} Local)`;
}

/** `22/09/2026 19H UTC (7h Local)` */
export function formatEventDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return `${date} ${formatEventTime(iso)}`;
}

/** Discord : UTC + timestamp auto-local. `22/09/2026 19H UTC (<t:…:t> Local)` */
export function formatEventDateTimeDiscord(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const unix = Math.floor(d.getTime() / 1000);
  return `${date} ${formatUtcClock(iso)} UTC (<t:${unix}:t> Local)`;
}

export function utcDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function utcDayKeyFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
