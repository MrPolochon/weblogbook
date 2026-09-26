import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSiteAdmin } from '@/lib/calendrier/staff';
import { CALENDAR_EVENT_SELECT, type CalendarEvent, type CalendarEventInput } from '@/lib/calendrier/types';

export const dynamic = 'force-dynamic';

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
  if (body.announce_discord !== undefined) {
    const announce = Boolean(body.announce_discord);
    patch.announce_discord = announce;
    if (!announce) {
      patch.announce_channel_id = null;
      patch.announce_role_id = null;
    }
  }
  if (body.announce_channel_id !== undefined && patch.announce_discord !== false) {
    patch.announce_channel_id = body.announce_channel_id || null;
  }
  if (body.announce_role_id !== undefined && patch.announce_discord !== false) {
    patch.announce_role_id = body.announce_role_id || null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .update(patch)
    .eq('id', id)
    .select(CALENDAR_EVENT_SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
  return NextResponse.json({ event: data as CalendarEvent });
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
