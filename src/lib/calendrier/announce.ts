import { discordSendMessage } from '@/lib/support/discord-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatEventDateTimeDiscord, formatEventUtcStamp } from '@/lib/calendrier/time';
import { CALENDAR_EVENT_SELECT, type CalendarEvent } from '@/lib/calendrier/types';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';

/** Fenêtre cron uniquement : jamais d’envoi à la création / édition. */
export const CALENDAR_ANNOUNCE_LOOKBACK_MS = 2 * 60 * 60 * 1000;

function pingText(roleId: string | null | undefined): string {
  if (!roleId) return '';
  if (roleId === 'everyone') return '@everyone';
  if (roleId === 'here') return '@here';
  return `<@&${roleId}>`;
}

function siteCalendrierUrl(): string {
  return `${OFFICIAL_SITE_URL.replace(/\/$/, '')}/calendrier`;
}

export function buildCalendarAnnounceContent(event: CalendarEvent): string {
  const ping = pingText(event.announce_role_id);
  const lines = [
    ping,
    `**${event.title}**`,
    event.description?.trim() || '',
    event.location ? `Lieu : ${event.location}` : '',
    `Début : ${formatEventDateTimeDiscord(event.starts_at)}`,
    event.ends_at ? `Fin : ${formatEventDateTimeDiscord(event.ends_at)}` : '',
    `Calendrier : ${siteCalendrierUrl()}`,
  ].filter(Boolean);
  return lines.join('\n').slice(0, 2000);
}

export function calendarCreatedChoiceText(event: CalendarEvent): string {
  return [
    `Événement créé : **${event.title}** — ${formatEventDateTimeDiscord(event.starts_at)}.`,
    `Souhaites-tu une annonce Discord **au début** de l’événement (${formatEventUtcStamp(event.starts_at)}), pas maintenant ?`,
    siteCalendrierUrl(),
  ].join('\n');
}

export function calendarAnnouncePickText(event: CalendarEvent): string {
  return [
    `L’annonce partira **au début** de l’événement (${formatEventUtcStamp(event.starts_at)}), pas maintenant.`,
    'Choisis un salon (et un rôle à ping, optionnel).',
  ].join('\n');
}

export function calendarAnnounceScheduledText(event: CalendarEvent): string {
  if (event.announce_sent_at) {
    return `Événement créé : **${event.title}**. Annonce Discord envoyée.\n${siteCalendrierUrl()}`;
  }
  return `Événement créé. Annonce Discord au début (${formatEventUtcStamp(event.starts_at)}), pas maintenant.\n${siteCalendrierUrl()}`;
}

export function calendarCreatedPlainText(event: CalendarEvent): string {
  return `Événement créé : **${event.title}** — ${formatEventDateTimeDiscord(event.starts_at)}.\n${siteCalendrierUrl()}`;
}

export async function announceCalendarEvent(event: CalendarEvent): Promise<string | null> {
  if (!event.announce_discord || !event.announce_channel_id) return null;
  const msg = await discordSendMessage(event.announce_channel_id, buildCalendarAnnounceContent(event));
  return msg?.id ? String(msg.id) : null;
}

export function calendarEventStartIsReached(startsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt);
  return !Number.isNaN(start.getTime()) && start.getTime() <= now.getTime();
}

/** Réservé au cron : envoie seulement quand le début UTC est atteint, une seule fois. */
export async function deliverCalendarAnnounceIfDue(event: CalendarEvent): Promise<CalendarEvent> {
  if (!event.announce_discord || !event.announce_channel_id || event.announce_sent_at) return event;
  if (!calendarEventStartIsReached(event.starts_at)) return event;
  try {
    const msgId = await announceCalendarEvent(event);
    if (!msgId) return event;
    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { data } = await admin
      .from('site_calendar_events')
      .update({
        announce_sent_at: now,
        announced_at: now,
        announce_message_id: msgId,
        updated_at: now,
      })
      .eq('id', event.id)
      .is('announce_sent_at', null)
      .select('id')
      .maybeSingle();
    if (data) {
      event.announce_sent_at = now;
      event.announced_at = now;
    }
  } catch (e) {
    console.error('[calendrier] announce', e);
  }
  return event;
}

export async function deliverDueCalendarAnnounces(now = new Date()): Promise<{ checked: number; sent: number }> {
  const windowStart = new Date(now.getTime() - CALENDAR_ANNOUNCE_LOOKBACK_MS).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .select(CALENDAR_EVENT_SELECT)
    .eq('announce_discord', true)
    .not('announce_channel_id', 'is', null)
    .is('announce_sent_at', null)
    .lte('starts_at', now.toISOString())
    .gt('starts_at', windowStart);
  if (error) throw error;

  let sent = 0;
  for (const row of data || []) {
    const updated = await deliverCalendarAnnounceIfDue(row as CalendarEvent);
    if (updated.announce_sent_at) sent += 1;
  }
  return { checked: data?.length ?? 0, sent };
}
