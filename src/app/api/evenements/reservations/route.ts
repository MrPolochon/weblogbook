export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reservationSchema } from '@/lib/events/rules';
import { checkAtcAccess, isKnownAtcAirportCode, loadAllAtcAccessRules, loadAtcAccessContext } from '@/lib/atc-grade-restrictions';
import { notifyUser } from '@/lib/notifications';

export async function GET(request: Request) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const profile = user ? await admin.from('profiles').select('role').eq('id', user.id).single() : { data: null };
    const staff = profile.data?.role === 'admin';
    const params = new URL(request.url).searchParams; const event = params.get('event_id');
    if (!event && !user) return NextResponse.json({ error: 'Connectez-vous pour voir le planning ATC libre.' }, { status: 401 });
    if (event && !/^[a-f0-9-]{36}$/i.test(event)) return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
    const page = Math.max(1, Math.min(1000, Math.floor(Number(params.get('page')) || 1)));
    let query = admin.from('event_reservations').select('*, profiles!event_reservations_user_id_fkey(identifiant), plans_vol!event_reservations_plan_id_fkey(statut)', { count: 'exact' });
    query = event ? query.eq('event_id', event) : query.eq('role', 'atc').eq('status', 'confirmed').gte('ends_at', new Date().toISOString());
    const { data, count, error } = await query.order('starts_at').order('id').range((page - 1) * 100, page * 100 - 1);
    if (error) throw error;
    const rows = (data || []).filter(r => staff || r.status === 'confirmed' || r.user_id === user?.id);
    let discord = new Map<string, string>();
    if (staff && rows.length) {
      const links = await admin.from('discord_links').select('user_id, discord_user_id').in('user_id', rows.map(r => r.user_id));
      if (links.error) throw links.error;
      discord = new Map((links.data || []).map(r => [r.user_id, r.discord_user_id]));
    }
    const reservations = rows.map(({ user_id, profiles, plans_vol, ...r }) => ({ ...r, mine: user_id === user?.id,
      identifiant: profiles?.identifiant, ...(staff ? { discord: discord.get(user_id) || null } : {}), plan_status: plans_vol?.statut || null }));
    let usage: unknown[] = [], occupied: unknown[] = [];
    if (event) {
      const used = await admin.rpc('event_slot_usage', { p_event: event }); if (used.error) throw used.error; usage = used.data || [];
      const info = await admin.from('major_event_configs').select('airports, site_calendar_events(starts_at,ends_at)').eq('event_id',event).single();
      if (info.error) throw info.error;
      const dates = info.data.site_calendar_events as unknown as { starts_at: string; ends_at: string };
      const taken = await admin.from('event_reservations').select('airport,position,starts_at,ends_at,event_id').eq('role','atc').eq('status','confirmed')
        .in('airport',info.data.airports).lt('starts_at',dates.ends_at).gt('ends_at',dates.starts_at).order('starts_at').limit(300);
      if (taken.error) throw taken.error; occupied = taken.data || [];
    }
    return NextResponse.json({ reservations, count, page, staff, loggedIn: Boolean(user), usage, occupied }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Planning indisponible. Vérifiez la migration des événements majeurs.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous avec votre compte du site pour réserver.' }, { status: 401 });
  const parsed = reservationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Réservation invalide.' }, { status: 400 });
  const value = parsed.data; const admin = createAdminClient();
  if (value.role === 'atc') {
    const [{ airportOptions }, context] = await Promise.all([loadAllAtcAccessRules(admin), loadAtcAccessContext(admin, user.id)]);
    if (!isKnownAtcAirportCode(value.airport, airportOptions)) return NextResponse.json({ error: 'Aéroport ATC inconnu.' }, { status: 400 });
    const access = checkAtcAccess(value.airport, value.position || '', context);
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 });
  }
  const { data, error } = await admin.rpc('reserve_event_slot', { p_user: user.id, p_data: value });
  if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'La mise à jour des réservations doit être appliquée à la base.' : error.message }, { status: 409 });
  await notifyUser(user.id, { type: 'event_booking', title: value.status === 'waitlisted' ? 'Inscription en liste d’attente' : 'Réservation confirmée',
    body: `${value.airport} · ${value.role === 'atc' ? value.position : value.callsign} · ${new Date(value.starts_at).toISOString()} UTC`,
    link: value.event_id ? `/evenements/${value.event_id}` : '/atc/reservations' });
  return NextResponse.json({ ok: true, id: data });
}
