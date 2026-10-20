export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reservationSchema } from '@/lib/events/rules';
import { checkAtcAccess, isKnownAtcAirportCode, loadAllAtcAccessRules, loadAtcAccessContext } from '@/lib/atc-grade-restrictions';
import { notifyUser } from '@/lib/notifications';
import { pilotNeedsFlightPlan, planBookingUrl } from '@/lib/events/registration';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.action === 'modify') {
    const parsed = reservationSchema.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const admin = createAdminClient();
    if (parsed.data.role === 'atc') {
      if (!isKnownAtcAirportCode(parsed.data.airport,(await loadAllAtcAccessRules(admin)).airportOptions)) return NextResponse.json({ error:'Aéroport ATC inconnu.' },{status:400});
      const access = checkAtcAccess(parsed.data.airport,parsed.data.position || '',await loadAtcAccessContext(admin,user.id));
      if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 });
    }
    const { error } = await admin.rpc('edit_event_slot',{p_actor:user.id,p_id:id,p_data:parsed.data});
    if (error) return NextResponse.json({ error: error.message },{status:409});
    return NextResponse.json({ok:true,id,requires_plan:parsed.data.role==='pilot'&&parsed.data.status==='confirmed'});
  }
  if (!['cancel','ready','promote','no_show'].includes(body.action)) return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  if(body.action==='ready') {
    const {data:booking,error}=await createAdminClient().from('event_reservations').select('role,status,plan_id,claimed_at,plans_vol(statut)').eq('id',id).maybeSingle();
    if(error) return NextResponse.json({error:'Vérification du plan indisponible.'},{status:503});
    const planStatus=(booking?.plans_vol as unknown as {statut?:string}|null)?.statut;
    if(booking&&(pilotNeedsFlightPlan(booking)||['annule','refuse'].includes(planStatus || ''))) return NextResponse.json({error:'Déposez d’abord votre plan de vol pour confirmer l’inscription pilote.'},{status:409});
  }
  const { error } = await createAdminClient().rpc('manage_event_reservation', { p_actor: user.id, p_id: id, p_action: body.action });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 409 });
  if (body.action !== 'ready') {
    const { data: booking } = await createAdminClient().from('event_reservations').select('user_id,event_id,airport,starts_at,role,status,plan_id,claimed_at').eq('id',id).single();
    if (booking) await notifyUser(booking.user_id,{type:'event_booking',title:body.action === 'promote' ? 'Place disponible : complétez votre plan de vol' : body.action === 'cancel' ? 'Réservation annulée' : 'Absence signalée',
      body:`${booking.airport} · ${booking.starts_at}`,link:pilotNeedsFlightPlan(booking) ? planBookingUrl(id) : booking.event_id ? `/evenements/${booking.event_id}` : '/atc/reservations'});
  }
  return NextResponse.json({ ok: true });
}
