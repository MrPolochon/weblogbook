import { createAdminClient } from '@/lib/supabase/admin';
import { findSiteAdminByDiscordId } from '@/lib/calendrier/staff';
import { parseUtcDateTime } from '@/lib/calendrier/time';
import { CALENDAR_EVENT_SELECT, type CalendarEvent, type CalendarEventInput } from '@/lib/calendrier/types';

const DATE_HINT = 'Ex. : 22/09/2026 19h, 22/09 19h, 19h';

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
    .select(CALENDAR_EVENT_SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Création impossible' };
  return { ok: true, event: data as CalendarEvent };
}

export type DiscordCalendarCreateResult =
  | { ok: true; event: CalendarEvent; pickChoice?: boolean }
  | { ok: false; error: string; status: number };

export async function createCalendarEventFromDiscord(opts: {
  discordId: string;
  title: string;
  description: string;
  startRaw: string;
  endRaw: string;
  location?: string;
}): Promise<DiscordCalendarCreateResult> {
  const staff = await findSiteAdminByDiscordId(opts.discordId);
  if (!staff) {
    return { ok: false, error: 'Administrateur site uniquement.', status: 403 };
  }

  const startsAt = parseUtcDateTime(opts.startRaw);
  if (!startsAt) {
    return { ok: false, error: `Début UTC invalide. ${DATE_HINT}`, status: 400 };
  }
  const endTrim = String(opts.endRaw || '').trim();
  const endsAt = endTrim ? parseUtcDateTime(endTrim) : null;
  if (endTrim && !endsAt) {
    return { ok: false, error: `Fin UTC invalide. ${DATE_HINT}`, status: 400 };
  }

  const parsed = sanitizeCalendarInput({
    title: opts.title,
    description: opts.description,
    location: opts.location || null,
    starts_at: startsAt,
    ends_at: endsAt,
    announce_discord: false,
    announce_channel_id: null,
    announce_role_id: null,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const saved = await persistCalendarEvent({
    data: parsed.data,
    createdBy: staff.id,
    createdVia: 'discord',
  });
  if (!saved.ok) return { ok: false, error: saved.error, status: 500 };
  return { ok: true, event: saved.event, pickChoice: true };
}

async function loadOwnedCalendarEvent(opts: {
  discordId: string;
  eventId: string;
}): Promise<DiscordCalendarCreateResult> {
  const staff = await findSiteAdminByDiscordId(opts.discordId);
  if (!staff) {
    return { ok: false, error: 'Administrateur site uniquement.', status: 403 };
  }

  const eventId = String(opts.eventId || '').trim();
  if (!eventId) return { ok: false, error: 'Événement introuvable.', status: 404 };

  const admin = createAdminClient();
  const { data: existing } = await admin.from('site_calendar_events').select(CALENDAR_EVENT_SELECT).eq('id', eventId).maybeSingle();
  if (!existing) return { ok: false, error: 'Événement introuvable.', status: 404 };
  const current = existing as CalendarEvent;
  if (current.created_by && current.created_by !== staff.id) {
    return { ok: false, error: 'Cet événement ne t’appartient pas.', status: 403 };
  }
  return { ok: true, event: current };
}

export async function loadCalendarEventFromDiscord(opts: {
  discordId: string;
  eventId: string;
}): Promise<DiscordCalendarCreateResult> {
  return loadOwnedCalendarEvent(opts);
}

export async function attachCalendarAnnounceFromDiscord(opts: {
  discordId: string;
  eventId: string;
  channelId?: string | null;
  roleId?: string | null;
}): Promise<DiscordCalendarCreateResult> {
  const loaded = await loadOwnedCalendarEvent(opts);
  if (!loaded.ok) return loaded;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (opts.channelId) {
    patch.announce_channel_id = String(opts.channelId);
    patch.announce_discord = true;
  }
  if (opts.roleId !== undefined) {
    patch.announce_role_id = opts.roleId ? String(opts.roleId) : null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .update(patch)
    .eq('id', loaded.event.id)
    .select(CALENDAR_EVENT_SELECT)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message || 'Mise à jour impossible', status: 500 };
  return { ok: true, event: data as CalendarEvent };
}
