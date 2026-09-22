import { createAdminClient } from '@/lib/supabase/admin';
import { announceCalendarEvent } from '@/lib/calendrier/announce';
import { parseAnnounceField } from '@/lib/calendrier/discord-parse';
import { listDiscordCalendarTargets } from '@/lib/calendrier/discord-targets';
import { findSiteAdminByDiscordId } from '@/lib/calendrier/staff';
import { parseUtcDateTime } from '@/lib/calendrier/time';
import type { CalendarEvent, CalendarEventInput } from '@/lib/calendrier/types';

const SELECT =
  'id, title, description, location, starts_at, ends_at, announce_discord, announce_channel_id, announce_role_id, announced_at, created_by, created_via, created_at';

export function sanitizeCalendarInput(
  body: CalendarEventInput,
): { ok: true; data: CalendarEventInput } | { ok: false; error: string } {
  const title = String(body.title || '').trim();
  if (title.length < 1 || title.length > 120) return { ok: false, error: 'Titre requis (1–120 caractères).' };
  const starts = new Date(body.starts_at);
  if (Number.isNaN(starts.getTime())) return { ok: false, error: 'Date de début UTC invalide.' };
  let endsAt: string | null = null;
  if (body.ends_at) {
    const ends = new Date(body.ends_at);
    if (Number.isNaN(ends.getTime())) return { ok: false, error: 'Date de fin UTC invalide.' };
    if (ends.getTime() < starts.getTime()) return { ok: false, error: 'La fin doit être après le début.' };
    endsAt = ends.toISOString();
  }
  const announce = Boolean(body.announce_discord);
  const channelId = announce ? String(body.announce_channel_id || '').trim() || null : null;
  if (announce && !channelId) return { ok: false, error: 'Choisis un salon Discord pour l’annonce.' };
  return {
    ok: true,
    data: {
      title,
      description: String(body.description || '').trim() || null,
      location: String(body.location || '').trim() || null,
      starts_at: starts.toISOString(),
      ends_at: endsAt,
      announce_discord: announce,
      announce_channel_id: channelId,
      announce_role_id: announce ? String(body.announce_role_id || '').trim() || null : null,
    },
  };
}

export async function persistCalendarEvent(opts: {
  data: CalendarEventInput;
  createdBy: string;
  createdVia: 'site' | 'discord';
}): Promise<{ ok: true; event: CalendarEvent } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .insert({
      ...opts.data,
      created_by: opts.createdBy,
      created_via: opts.createdVia,
    })
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Création impossible' };

  const event = data as CalendarEvent;
  if (event.announce_discord && !event.announced_at) {
    try {
      const msgId = await announceCalendarEvent(event);
      if (msgId) {
        const now = new Date().toISOString();
        await admin
          .from('site_calendar_events')
          .update({ announced_at: now, announce_message_id: msgId, updated_at: now })
          .eq('id', event.id);
        event.announced_at = now;
      }
    } catch (e) {
      console.error('[calendrier] announce', e);
    }
  }
  return { ok: true, event };
}

export async function createCalendarEventFromDiscord(opts: {
  discordId: string;
  title: string;
  description: string;
  startRaw: string;
  endRaw: string;
  announceRaw: string;
}): Promise<{ ok: true; event: CalendarEvent } | { ok: false; error: string; status: number }> {
  const staff = await findSiteAdminByDiscordId(opts.discordId);
  if (!staff) {
    return { ok: false, error: 'Administrateur site uniquement.', status: 403 };
  }

  const startsAt = parseUtcDateTime(opts.startRaw);
  if (!startsAt) {
    return { ok: false, error: 'Début UTC invalide. Format : YYYY-MM-DD HH:MM', status: 400 };
  }
  const endTrim = String(opts.endRaw || '').trim();
  const endsAt = endTrim ? parseUtcDateTime(endTrim) : null;
  if (endTrim && !endsAt) {
    return { ok: false, error: 'Fin UTC invalide. Format : YYYY-MM-DD HH:MM', status: 400 };
  }

  const targets = await listDiscordCalendarTargets();
  const announce = parseAnnounceField(opts.announceRaw, targets.channels, targets.roles);

  const parsed = sanitizeCalendarInput({
    title: opts.title,
    description: opts.description,
    starts_at: startsAt,
    ends_at: endsAt,
    announce_discord: announce.announce,
    announce_channel_id: announce.channelId,
    announce_role_id: announce.roleId,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const saved = await persistCalendarEvent({
    data: parsed.data,
    createdBy: staff.id,
    createdVia: 'discord',
  });
  if (!saved.ok) return { ok: false, error: saved.error, status: 500 };
  return { ok: true, event: saved.event };
}
