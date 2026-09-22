import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSiteAdmin } from '@/lib/calendrier/staff';
import { persistCalendarEvent, sanitizeCalendarInput } from '@/lib/calendrier/create';
import type { CalendarEvent, CalendarEventInput } from '@/lib/calendrier/types';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, title, description, location, starts_at, ends_at, announce_discord, announce_channel_id, announce_role_id, announced_at, created_by, created_via, created_at';

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_calendar_events')
    .select(SELECT)
    .order('starts_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: (data || []) as CalendarEvent[] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const staff = await requireSiteAdmin(user.id);
  if (!staff) return NextResponse.json({ error: 'Administrateur site uniquement.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as CalendarEventInput;
  const parsed = sanitizeCalendarInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await persistCalendarEvent({
    data: parsed.data,
    createdBy: staff.id,
    createdVia: 'site',
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ event: saved.event });
}
