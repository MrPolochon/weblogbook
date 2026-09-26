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

/** Heure UTC : `19h`, `19H`, `19h30`, `19:00`. Minutes optionnelles (= 00). */
function parseUtcClock(raw: string): { hour: number; minute: number } | null {
  const m = String(raw || '').trim().match(/^(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function utcFromParts(year: number, month: number, day: number, hour: number, minute: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d.toISOString();
}

/**
 * Saisie Discord / humaine, toujours interprétée en UTC.
 * `22/09/2026 19:00`, `22/09/2026 19h`, `22/09 19h`, `19h`, `2026-09-22 19:00`.
 */
export function parseUtcDateTime(raw: string, now = new Date()): string | null {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;

  const timeOnly = parseUtcClock(t);
  if (timeOnly) {
    return utcFromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), timeOnly.hour, timeOnly.minute);
  }

  const fr = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(.+)$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    let year = fr[3] != null ? Number(fr[3]) : now.getUTCFullYear();
    if (year < 100) year += 2000;
    const clock = parseUtcClock(fr[4]);
    if (!clock || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return utcFromParts(year, month, day, clock.hour, clock.minute);
  }

  const iso = t.replace('T', ' ').match(/^(\d{4})-(\d{2})-(\d{2}) (.+)$/);
  if (iso) {
    const clock = parseUtcClock(iso[4]);
    if (!clock) return null;
    return utcFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), clock.hour, clock.minute);
  }

  return null;
}

/** `20/10/2026 0H UTC` */
export function formatEventUtcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return `${date} ${formatUtcClock(iso)} UTC`;
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
