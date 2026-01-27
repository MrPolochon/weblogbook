import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    // Vérifier que l'utilisateur est ATC ou admin
    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isAtc = profile?.role === 'atc' || Boolean(profile?.atc);
    
    if (!isAdmin && !isAtc) {
      return NextResponse.json({ error: 'Réservé aux ATC et admins' }, { status: 403 });
    }

    // Vérifier que l'ATC est en service (sauf admin)
    const { data: session } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
    if (!session && !isAdmin) {
      return NextResponse.json({ error: 'Vous devez être en service pour créer un plan de vol.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      pilote_id,
      aeroport_depart,
      aeroport_arrivee,
      numero_vol,
      porte,
      temps_prev_min,
      type_vol,
      intentions_vol,
      sid_depart,
      star_arrivee,
      route_ifr,
      note_atc,
    } = body;

    // Validation
    const ad = String(aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();
    
    if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) {
      return NextResponse.json({ error: 'Aéroports invalides.' }, { status: 400 });
    }
    
    if (!pilote_id) {
      return NextResponse.json({ error: 'Pilote requis.' }, { status: 400 });
    }
    
    if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) {
      return NextResponse.json({ error: 'Numéro de vol requis.' }, { status: 400 });
    }
    
    const t = parseInt(String(temps_prev_min), 10);
    if (isNaN(t) || t < 1) {
      return NextResponse.json({ error: 'Temps prévu invalide (minutes ≥ 1).' }, { status: 400 });
    }
    
    if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) {
      return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
    }
    
    if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) {
      return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
    }
    
    if (String(type_vol) === 'IFR') {
      if (!sid_depart || !String(sid_depart).trim()) {
        return NextResponse.json({ error: 'SID de départ requise pour IFR.' }, { status: 400 });
      }
      if (!star_arrivee || !String(star_arrivee).trim()) {
        return NextResponse.json({ error: 'STAR d\'arrivée requise pour IFR.' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    // Vérifier que le pilote existe
    const { data: piloteProfile } = await admin.from('profiles').select('id, identifiant, role').eq('id', pilote_id).single();
    if (!piloteProfile) {
      return NextResponse.json({ error: 'Pilote introuvable.' }, { status: 404 });
    }
    if (piloteProfile.role === 'atc') {
      return NextResponse.json({ error: 'Ce compte est ATC uniquement et ne peut pas avoir de plan de vol.' }, { status: 400 });
    }

    // Créer le plan de vol directement accepté et assigné à l'ATC
    const { data, error } = await admin.from('plans_vol').insert({
      pilote_id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: String(numero_vol).trim(),
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
      note_atc: note_atc ? String(note_atc).trim() : null,
      statut: 'accepte', // Directement accepté car créé par l'ATC
      accepted_at: new Date().toISOString(),
      current_holder_user_id: user.id,
      current_holder_position: session?.position || 'Admin',
      current_holder_aeroport: session?.aeroport || ad,
      vol_commercial: false,
      vol_sans_atc: false,
      vol_ferry: false,
      automonitoring: false,
      created_by_atc: true, // Marqueur pour indiquer que le plan a été créé par un ATC
    }).select('id').single();

    if (error) {
      console.error('Erreur création plan ATC:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Enregistrer le contrôle ATC
    await admin.from('atc_plans_controles').upsert({
      plan_vol_id: data.id,
      user_id: user.id,
      aeroport: session?.aeroport || ad,
      position: session?.position || 'Admin'
    }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });

    return NextResponse.json({ ok: true, id: data.id, pilote: piloteProfile.identifiant });
  } catch (e) {
    console.error('POST atc/creer-plan:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
