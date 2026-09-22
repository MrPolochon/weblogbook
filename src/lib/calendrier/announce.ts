import { discordSendMessage } from '@/lib/support/discord-api';
import { formatEventDateTimeDiscord } from '@/lib/calendrier/time';
import type { CalendarEvent } from '@/lib/calendrier/types';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';

function pingText(roleId: string | null | undefined): string {
  if (!roleId) return '';
  if (roleId === 'everyone') return '@everyone';
  if (roleId === 'here') return '@here';
  return `<@&${roleId}>`;
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
    `Calendrier : ${OFFICIAL_SITE_URL.replace(/\/$/, '')}/calendrier`,
  ].filter(Boolean);
  return lines.join('\n').slice(0, 2000);
}

export async function announceCalendarEvent(event: CalendarEvent): Promise<string | null> {
  if (!event.announce_discord || !event.announce_channel_id) return null;
  const msg = await discordSendMessage(event.announce_channel_id, buildCalendarAnnounceContent(event));
  return msg?.id ? String(msg.id) : null;
}
