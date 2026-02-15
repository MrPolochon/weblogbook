import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isAtc = profile?.role === 'atc' || Boolean(profile?.atc);

    if (!isAdmin && !isAtc) {
      return NextResponse.json({ error: 'Réservé aux ATC et admins' }, { status: 403 });
    }

    const { data: session } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
    if (!session && !isAdmin) {
      return NextResponse.json({ error: 'Vous devez être en service.' }, { status: 403 });
    }

    const body = await request.json();
    const { numero_vol, aeroport_arrivee, type_vol } = body;

    const ad = session?.aeroport || String(body.aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();

    if (!CODES_OACI_VALIDES.has(ad)) {
      return NextResponse.json({ error: 'Aéroport de départ invalide.' }, { status: 400 });
    }
    if (!CODES_OACI_VALIDES.has(aa)) {
      return NextResponse.json({ error: 'Aéroport d\'arrivée invalide.' }, { status: 400 });
    }
    if (!numero_vol || !String(numero_vol).trim()) {
      return NextResponse.json({ error: 'Callsign requis.' }, { status: 400 });
    }
    if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) {
      return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.from('plans_vol').insert({
      pilote_id: null,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: String(numero_vol).trim().toUpperCase(),
      temps_prev_min: 30,
      type_vol: String(type_vol),
      statut: 'accepte',
      accepted_at: new Date().toISOString(),
      current_holder_user_id: user.id,
      current_holder_position: session?.position || 'Admin',
      current_holder_aeroport: session?.aeroport || ad,
      vol_commercial: false,
      vol_sans_atc: false,
      vol_ferry: false,
      automonitoring: false,
      created_by_atc: true,
    }).select('id').single();

    if (error) {
      console.error('Erreur création strip manuel:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await admin.from('atc_plans_controles').upsert({
      plan_vol_id: data.id,
      user_id: user.id,
      aeroport: session?.aeroport || ad,
      position: session?.position || 'Admin',
    }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('POST atc/creer-strip:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
