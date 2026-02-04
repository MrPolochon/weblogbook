import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { callId, reset } = body;

    const admin = createAdminClient();

    if (reset) {
      // Reset tous les appels de l'utilisateur
      await admin.from('atc_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .in('status', ['ringing', 'connected']);
      return NextResponse.json({ ok: true });
    }

    if (callId) {
      await admin.from('atc_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', callId)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI hangup:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
