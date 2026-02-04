import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: session } = await supabase.from('afis_sessions').select('id, aeroport').eq('user_id', user.id).single();
    if (!session) return NextResponse.json({ error: 'non_en_service' }, { status: 400 });

    const body = await request.json();
    const { to_aeroport, to_position, is_emergency } = body;
    console.log('SIAVI call request:', { to_aeroport, to_position, is_emergency, from_aeroport: session.aeroport });

    const admin = createAdminClient();

    // Vérifier pas d'appel en cours
    const { data: existing } = await admin.from('atc_calls')
      .select('id')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .in('status', ['ringing', 'connected'])
      .maybeSingle();

    if (existing) return NextResponse.json({ error: 'appel_en_cours' }, { status: 400 });

    let toUserId = null;

    // Appel d'urgence 911/112 -> n'importe quel AFIS disponible
    if (is_emergency && to_position === 'AFIS') {
      const { data: afisDisponible } = await admin.from('afis_sessions')
        .select('user_id')
        .eq('est_afis', true)
        .neq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!afisDisponible) {
        return NextResponse.json({ error: 'no_afis' }, { status: 400 });
      }

      // Créer l'appel d'urgence (sera assigné au premier AFIS qui répond)
      const { data: call, error } = await admin.from('atc_calls').insert({
        from_user_id: user.id,
        from_aeroport: session.aeroport,
        from_position: 'AFIS',
        to_aeroport: 'ANY',
        to_position: 'AFIS',
        to_user_id: null, // Sera assigné au premier qui répond
        status: 'ringing',
        is_emergency: true,
      }).select().single();

      if (error) return NextResponse.json({ error: 'erreur_creation' }, { status: 500 });
      return NextResponse.json({ call });
    }

    // Appel AFIS spécifique
    if (to_position === 'AFIS') {
      const { data: targetSession } = await admin.from('afis_sessions')
        .select('user_id')
        .eq('aeroport', to_aeroport)
        .eq('est_afis', true)
        .maybeSingle();

      if (!targetSession) return NextResponse.json({ error: 'offline' }, { status: 400 });
      toUserId = targetSession.user_id;
    } else {
      // Appel vers ATC normal
      console.log('SIAVI->ATC call:', { to_aeroport, to_position });
      
      // Debug: lister toutes les sessions ATC actives
      const { data: allAtcSessions } = await admin.from('atc_sessions').select('aeroport, position, user_id');
      console.log('All active ATC sessions:', allAtcSessions);
      
      const { data: targetSession, error: sessionErr } = await admin.from('atc_sessions')
        .select('user_id')
        .eq('aeroport', to_aeroport)
        .eq('position', to_position)
        .maybeSingle();

      console.log('Target ATC session found:', targetSession, 'Query error:', sessionErr);
      if (!targetSession) return NextResponse.json({ error: 'offline' }, { status: 400 });
      toUserId = targetSession.user_id;
    }

    // Vérifier que la cible n'est pas en appel
    const { data: targetBusy } = await admin.from('atc_calls')
      .select('id')
      .or(`from_user_id.eq.${toUserId},to_user_id.eq.${toUserId}`)
      .in('status', ['ringing', 'connected'])
      .maybeSingle();

    if (targetBusy) return NextResponse.json({ error: 'cible_occupee' }, { status: 400 });

    // Créer l'appel
    const { data: call, error } = await admin.from('atc_calls').insert({
      from_user_id: user.id,
      from_aeroport: session.aeroport,
      from_position: 'AFIS',
      to_aeroport,
      to_position,
      to_user_id: toUserId,
      status: 'ringing',
      is_emergency: false,
    }).select().single();

    if (error) return NextResponse.json({ error: 'erreur_creation' }, { status: 500 });
    return NextResponse.json({ call });
  } catch (err) {
    console.error('SIAVI call:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
