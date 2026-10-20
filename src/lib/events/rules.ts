import { z } from 'zod';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

export const MAJOR_EVENT_MAX_MOVEMENTS = 100;
/** Même explication lisible dans le formulaire et les réponses API. */
export function majorConfigError(error: { issues: { path: PropertyKey[] }[] }): string {
  const messages: Record<string,string> = {
    airports: 'Aéroports : sélectionnez entre 1 et 30 aéroports PTFS valides.',
    slot_minutes: 'Durée du créneau : indiquez un nombre entier entre 5 et 60 minutes.',
    pilot_capacity: `Capacité du créneau : indiquez un nombre entier entre 1 et ${MAJOR_EVENT_MAX_MOVEMENTS} mouvements par aéroport. Ce n’est pas le total des places de l’événement.`,
    atc_positions: 'Positions ATC : sélectionnez au moins un poste valide.',
    enabled: 'État de l’événement invalide.',
    bookings_open: 'État des inscriptions invalide.',
  };
  return [...new Set(error.issues.map(issue=>messages[String(issue.path[0])] || 'Renseignez la configuration complète de l’événement majeur.'))].join(' ');
}

export const majorConfigSchema = z.object({
  airports: z.array(z.string().trim().toUpperCase().refine(v => CODES_OACI_VALIDES.has(v), 'Aéroport PTFS inconnu')).min(1).max(30).transform(v => [...new Set(v)]),
  slot_minutes: z.number().int().min(5).max(60), pilot_capacity: z.number().int().min(1).max(MAJOR_EVENT_MAX_MOVEMENTS),
  atc_positions: z.array(z.string().refine(v => (ATC_POSITIONS as readonly string[]).includes(v))).min(1).max(7).transform(v => [...new Set(v)]),
  enabled: z.boolean().default(true), bookings_open: z.boolean().default(true),
});
export const reservationSchema = z.object({
  event_id: z.uuid().nullable(), role: z.enum(['pilot','atc']), airport: z.string().trim().toUpperCase().min(4).max(12),
  position: z.string().nullable().optional(), starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
  movement: z.enum(['departure','arrival']).nullable().optional(), departure: z.string().trim().toUpperCase().optional(), arrival: z.string().trim().toUpperCase().optional(),
  departure_at: z.iso.datetime({ offset: true }).optional(), duration_minutes: z.number().int().min(1).max(1440).optional(),
  callsign: z.string().trim().min(1).max(30).optional(), airline: z.string().trim().max(100).optional(), aircraft: z.string().trim().max(100).optional(),
  status: z.enum(['confirmed','waitlisted']).default('confirmed'),
}).superRefine((v, ctx) => {
  if (new Date(v.ends_at) <= new Date(v.starts_at)) ctx.addIssue({ code: 'custom', message: 'La fin doit suivre le début.' });
  if (v.role === 'pilot' && (!v.event_id || !v.callsign || !v.aircraft || !v.departure_at || !v.duration_minutes || !v.movement || !CODES_OACI_VALIDES.has(v.departure || '') || !CODES_OACI_VALIDES.has(v.arrival || ''))) ctx.addIssue({ code: 'custom', message: 'Renseignez la route, l’appareil, le callsign et le slot.' });
  if (v.role === 'atc' && !(ATC_POSITIONS as readonly string[]).includes(v.position || '')) ctx.addIssue({ code: 'custom', message: 'Position ATC invalide.' });
});
export function eventBannerState(start: string, end: string | null, enabled: boolean, now = Date.now()): 'upcoming' | 'active' | null {
  const a = Date.parse(start), b = Date.parse(end || '');
  if (!enabled || !Number.isFinite(a) || !Number.isFinite(b) || now < a - 86_400_000 || now >= b) return null;
  return now < a ? 'upcoming' : 'active';
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
