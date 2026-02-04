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
    const { to_aeroport, to_position, is_emergency, number } = body;
    const numberDialed = number || `${to_aeroport}-${to_position}`;
    console.log('SIAVI call request:', { to_aeroport, to_position, is_emergency, from_aeroport: session.aeroport, numberDialed });

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

      // Créer l'appel d'urgence vers le premier AFIS disponible
      const { data: call, error } = await admin.from('atc_calls').insert({
        from_user_id: user.id,
        from_aeroport: session.aeroport,
        from_position: 'AFIS',
        to_aeroport: 'ANY',
        to_position: 'AFIS',
        to_user_id: afisDisponible.user_id,
        number_dialed: numberDialed,
        status: 'ringing',
        is_emergency: true,
      }).select().single();

      if (error) {
        console.error('Erreur création appel urgence:', error);
        return NextResponse.json({ error: 'erreur_creation', details: error.message }, { status: 500 });
      }
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
      
      if (!targetSession) {
        // Vérifier si l'aéroport a des ATC en ligne (mais pas sur cette position)
        const { data: aeroportSessions } = await admin.from('atc_sessions')
          .select('position')
          .eq('aeroport', to_aeroport);
        
        if (aeroportSessions && aeroportSessions.length > 0) {
          // Il y a des ATC mais pas sur cette position
          const positions = aeroportSessions.map(s => s.position).join(', ');
          console.log(`ATC offline for ${to_position} at ${to_aeroport}. Available positions: ${positions}`);
          return NextResponse.json({ 
            error: 'position_offline',
            message: `Position ${to_position} non disponible. Positions en ligne: ${positions}`
          }, { status: 400 });
        }
        
        // Aucun ATC sur cet aéroport
        console.log(`No ATC online at ${to_aeroport}`);
        return NextResponse.json({ error: 'offline' }, { status: 400 });
      }
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
      number_dialed: numberDialed,
      status: 'ringing',
      is_emergency: false,
    }).select().single();

    if (error) {
      console.error('Erreur création appel:', error);
      return NextResponse.json({ error: 'erreur_creation', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ call });
  } catch (err) {
    console.error('SIAVI call:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
