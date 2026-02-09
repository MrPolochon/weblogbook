import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST - Raccrocher ou réinitialiser
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { callId, reset } = body;

    const admin = createAdminClient();

    // Mode reset : terminer tous les appels de l'utilisateur
    if (reset === true) {
      await admin
        .from('atc_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .in('status', ['ringing', 'connected']);
      
      return NextResponse.json({ ok: true, reset: true });
    }

    if (!callId) {
      return NextResponse.json({ error: 'ID d\'appel requis' }, { status: 400 });
    }

    // Vérifier que l'appel existe et appartient à l'utilisateur
    const { data: call } = await admin
      .from('atc_calls')
      .select('id, from_user_id, to_user_id, status')
      .eq('id', callId)
      .single();

    if (!call) {
      return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 });
    }

    if (call.from_user_id !== user.id && call.to_user_id !== user.id) {
      return NextResponse.json({ error: 'Cet appel ne vous appartient pas' }, { status: 403 });
    }

    // Mettre à jour le statut de l'appel
    const { error } = await admin
      .from('atc_calls')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (error) {
      console.error('Erreur raccrochage:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erreur POST telephone/hangup:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
