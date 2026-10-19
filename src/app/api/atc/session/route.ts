export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { stopAtisIfController } from '@/lib/atis-bot-api';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { finaliserCloturesEnAttenteSansControleur } from '@/lib/plans-vol/closure';
import { checkAtcAccess, isKnownAtcAirportCode, loadAllAtcAccessRules, loadAtcAccessContext } from '@/lib/atc-grade-restrictions';
import { enforceAtcHandover } from '@/lib/events/atc-handover';

/**
 * POST - Se mettre en service sur une position.
 * Règles : une position (aeroport, position) est bloquée tant que le contrôleur
 * ne se met pas hors service, sauf relève automatique à l'heure d'une réservation.
 * Une réservation active peut provoquer la relève automatique du titulaire précédent.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const { aeroport, position } = body;
    const ap = String(aeroport || '').toUpperCase();
    const airportOptions = CODES_OACI_VALIDES.has(ap) ? null : (await loadAllAtcAccessRules(createAdminClient())).airportOptions;
    if (!isKnownAtcAirportCode(ap, airportOptions ?? undefined)) {
      return NextResponse.json({ error: 'Aéroport ATC inconnu.' }, { status: 400 });
    }
    if (!position || !(ATC_POSITIONS as readonly string[]).includes(String(position))) {
      return NextResponse.json({ error: 'Position invalide (Delivery, Clairance, Ground, Tower, APP, DEP, Center).' }, { status: 400 });
    }

    const admin = createAdminClient();

    const accessCtx = await loadAtcAccessContext(admin, user.id);
    const access = checkAtcAccess(ap, String(position), accessCtx);
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 });
    }

    // Libérer les sessions dont le créneau vient d'être réservé à un autre titulaire.
    await enforceAtcHandover();
    const { data: existing } = await admin.from('atc_sessions').select('id, user_id').eq('aeroport', ap).eq('position', position).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Position déjà prise. Le contrôleur en place doit se mettre hors service.' }, { status: 400 });

    // Un utilisateur ne peut avoir qu'une seule session
    const { data: mySession } = await admin.from('atc_sessions').select('id').eq('user_id', user.id).maybeSingle();
    if (mySession) return NextResponse.json({ error: 'Vous avez déjà une session. Mettez-vous hors service d\'abord.' }, { status: 400 });

    // Insert via admin pour garantir l'atomicité ; la contrainte UNIQUE(aeroport, position) empêche toute prise de position déjà occupée
    const { error } = await admin.from('atc_sessions').insert({ user_id: user.id, aeroport: ap, position: String(position) });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Position déjà prise. Le contrôleur en place doit se mettre hors service.' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ATC session POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await admin.from('atc_sessions').select('id').eq('user_id',user.id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ ok: true, alreadyEnded: true });
    const { data, error } = await admin.rpc('finish_atc_service',{p_session:session.id,p_force:body.force===true});
    if (error?.message.includes('FLIGHTS_HELD')) return NextResponse.json({error:'Vous avez encore des plans sous contrôle. Transférez-les ou confirmez la fin de service forcée.',code:'FLIGHTS_HELD'}, {status:409});
    if (error) throw error;
    await stopAtisIfController(user.id);
    await finaliserCloturesEnAttenteSansControleur(admin);
    return NextResponse.json(data);
  } catch (error) {
    console.error('ATC service end:',error);
    return NextResponse.json({error:'Fin de service indisponible. Réessayez.'},{status:503});
  }
}
