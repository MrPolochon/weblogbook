import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// POST - Répondre à un appel
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { callId } = body;

    if (!callId) {
      return NextResponse.json({ error: 'ID d\'appel requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'appel existe et appartient à l'utilisateur
    const { data: call } = await admin
      .from('atc_calls')
      .select('id, to_user_id, status')
      .eq('id', callId)
      .single();

    if (!call) {
      return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 });
    }

    if (call.to_user_id !== user.id) {
      return NextResponse.json({ error: 'Cet appel ne vous appartient pas' }, { status: 403 });
    }

    if (call.status !== 'ringing') {
      return NextResponse.json({ error: 'Cet appel n\'est plus en attente' }, { status: 400 });
    }

    // Mettre à jour le statut de l'appel
    const { error } = await admin
      .from('atc_calls')
      .update({
        status: 'connected',
        answered_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (error) {
      console.error('Erreur réponse appel:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ call: { id: callId } });
  } catch (e) {
    console.error('Erreur POST telephone/answer:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
