import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSiteAdmin } from '@/lib/calendrier/staff';
import { persistCalendarEvent, sanitizeCalendarInput } from '@/lib/calendrier/create';
import type { CalendarEvent, CalendarEventInput } from '@/lib/calendrier/types';

export const dynamic = 'force-dynamic';

/** Champs d’affichage public — aucun identifiant Discord ni interne d’annonce. */
const PUBLIC_SELECT =
  'id, title, description, location, starts_at, ends_at, created_via, created_at';

const STAFF_SELECT =
  'id, title, description, location, starts_at, ends_at, announce_discord, announce_channel_id, announce_role_id, announced_at, created_by, created_via, created_at';

export async function GET() {
  let staff = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    staff = user ? await requireSiteAdmin(user.id) : null;
  } catch {
    staff = null;
  }

  const admin = createAdminClient();
  const result = staff
    ? await admin.from('site_calendar_events').select(STAFF_SELECT).order('starts_at', { ascending: true })
    : await admin.from('site_calendar_events').select(PUBLIC_SELECT).order('starts_at', { ascending: true });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ events: (result.data || []) as unknown as CalendarEvent[] });
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
