import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSiteAdmin } from '@/lib/calendrier/staff';
import { announceCalendarEvent } from '@/lib/calendrier/announce';
import type { CalendarEvent, CalendarEventInput } from '@/lib/calendrier/types';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, title, description, location, starts_at, ends_at, announce_discord, announce_channel_id, announce_role_id, announced_at, created_by, created_via, created_at';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const staff = await requireSiteAdmin(user.id);
  if (!staff) return NextResponse.json({ error: 'Administrateur site uniquement.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Partial<CalendarEventInput>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 120) return NextResponse.json({ error: 'Titre invalide.' }, { status: 400 });
    patch.title = title;
  }
  if (body.description !== undefined) patch.description = String(body.description || '').trim() || null;
  if (body.location !== undefined) patch.location = String(body.location || '').trim() || null;
  if (body.starts_at) {
    const d = new Date(body.starts_at);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Début UTC invalide.' }, { status: 400 });
    patch.starts_at = d.toISOString();
  }
  if (body.ends_at !== undefined) {
    if (!body.ends_at) patch.ends_at = null;
    else {
      const d = new Date(body.ends_at);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Fin UTC invalide.' }, { status: 400 });
      patch.ends_at = d.toISOString();
    }
  }
  if (body.announce_discord !== undefined) patch.announce_discord = Boolean(body.announce_discord);
  if (body.announce_channel_id !== undefined) patch.announce_channel_id = body.announce_channel_id || null;
  if (body.announce_role_id !== undefined) patch.announce_role_id = body.announce_role_id || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });

  const event = data as CalendarEvent;
  if (event.announce_discord && !event.announced_at && event.announce_channel_id) {
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

  return NextResponse.json({ event });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const staff = await requireSiteAdmin(user.id);
  if (!staff) return NextResponse.json({ error: 'Administrateur site uniquement.' }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin.from('site_calendar_events').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
