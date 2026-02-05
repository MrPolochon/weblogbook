import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:entry',message:'SIAVI call API entry',data:{userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: session } = await supabase.from('afis_sessions').select('id, aeroport').eq('user_id', user.id).single();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:session',message:'SIAVI session check',data:{hasSession:!!session,aeroport:session?.aeroport},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!session) return NextResponse.json({ error: 'non_en_service' }, { status: 400 });

    const body = await request.json();
    const { to_aeroport, to_position, is_emergency, number } = body;
    const numberDialed = number || `${to_aeroport}-${to_position}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:params',message:'SIAVI call params',data:{to_aeroport,to_position,is_emergency,numberDialed},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    console.log('SIAVI call request:', { to_aeroport, to_position, is_emergency, from_aeroport: session.aeroport, numberDialed });

    const admin = createAdminClient();

    // Nettoyer les appels expirés de l'utilisateur (ringing > 60s ou connected > 10min)
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    
    await admin.from('atc_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .eq('status', 'ringing')
      .lt('started_at', sixtySecondsAgo);
    
    await admin.from('atc_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .eq('status', 'connected')
      .lt('started_at', tenMinutesAgo);

    // Vérifier pas d'appel en cours (après nettoyage)
    const { data: existing } = await admin.from('atc_calls')
      .select('id, status, started_at')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .in('status', ['ringing', 'connected'])
      .maybeSingle();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:existing',message:'Check existing call',data:{hasExisting:!!existing,existing},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (existing) {
      console.log('Appel existant trouvé:', existing);
      return NextResponse.json({ error: 'appel_en_cours' }, { status: 400 });
    }

    let toUserId = null;

    // Appel d'urgence 911/112 -> n'importe quel agent SIAVI disponible (AFIS OU pompier)
    if (is_emergency && to_position === 'AFIS') {
      // Chercher n'importe quel agent SIAVI en service (est_afis true OU false = pompier)
      const { data: agentDisponible } = await admin.from('afis_sessions')
        .select('user_id')
        .neq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!agentDisponible) {
        return NextResponse.json({ error: 'no_afis' }, { status: 400 });
      }

      // Créer l'appel d'urgence vers le premier agent disponible
      const { data: call, error } = await admin.from('atc_calls').insert({
        from_user_id: user.id,
        from_aeroport: session.aeroport,
        from_position: 'AFIS',
        to_aeroport: 'ANY',
        to_position: 'AFIS',
        to_user_id: agentDisponible.user_id,
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:atc-sessions',message:'All ATC sessions',data:{allAtcSessions,to_aeroport,to_position},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      
      const { data: targetSession, error: sessionErr } = await admin.from('atc_sessions')
        .select('user_id')
        .eq('aeroport', to_aeroport)
        .eq('position', to_position)
        .maybeSingle();

      console.log('Target ATC session found:', targetSession, 'Query error:', sessionErr);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/call/route.ts:target-session',message:'Target ATC session',data:{targetSession,sessionErr:sessionErr?.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      
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
