import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// POST - Initier un appel
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { to_aeroport, to_position, number } = body;

    if (!to_aeroport || !to_position) {
      return NextResponse.json({ error: 'Aéroport et position requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Nettoyer les appels expirés (ringing depuis plus de 60 secondes)
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    await admin
      .from('atc_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('status', 'ringing')
      .lt('started_at', sixtySecondsAgo);

    // Vérifier que l'utilisateur est en service
    const { data: session } = await admin
      .from('atc_sessions')
      .select('aeroport, position')
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'non_en_service' }, { status: 403 });
    }

    // Chercher l'ATC cible
    const { data: targetSession } = await admin
      .from('atc_sessions')
      .select('user_id, aeroport, position')
      .eq('aeroport', to_aeroport)
      .eq('position', to_position)
      .single();

    if (!targetSession) {
      return NextResponse.json({ error: 'offline' }, { status: 404 });
    }

    // Vérifier si l'ATC cible a refusé un appel récent de cet utilisateur
    const { data: recentRejected } = await admin
      .from('atc_calls')
      .select('id')
      .eq('from_user_id', user.id)
      .eq('to_user_id', targetSession.user_id)
      .eq('status', 'rejected')
      .gte('started_at', new Date(Date.now() - 30000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recentRejected) {
      return NextResponse.json({ error: 'rejected' }, { status: 403 });
    }

    // Vérifier qu'il n'y a pas déjà un appel en cours pour l'appelant
    const { data: myExistingCalls } = await admin
      .from('atc_calls')
      .select('id, status')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .in('status', ['ringing', 'connected']);

    if (myExistingCalls && myExistingCalls.length > 0) {
      return NextResponse.json({ error: 'appel_en_cours' }, { status: 400 });
    }

    // Vérifier que la cible n'a pas déjà un appel en cours
    const { data: targetExistingCalls } = await admin
      .from('atc_calls')
      .select('id, status')
      .or(`from_user_id.eq.${targetSession.user_id},to_user_id.eq.${targetSession.user_id}`)
      .in('status', ['ringing', 'connected']);

    if (targetExistingCalls && targetExistingCalls.length > 0) {
      return NextResponse.json({ error: 'cible_occupee' }, { status: 400 });
    }

    // Créer l'appel
    const { data: call, error } = await admin
      .from('atc_calls')
      .insert({
        from_user_id: user.id,
        from_aeroport: session.aeroport,
        from_position: session.position,
        to_user_id: targetSession.user_id,
        to_aeroport: to_aeroport,
        to_position: to_position,
        number_dialed: number,
        status: 'ringing',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erreur création appel:', error);
      return NextResponse.json({ error: 'erreur_creation' }, { status: 400 });
    }

    return NextResponse.json({ call: { id: call.id } });
  } catch (e) {
    console.error('Erreur POST telephone/call:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
