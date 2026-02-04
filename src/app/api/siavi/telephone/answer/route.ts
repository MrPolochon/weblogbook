import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { callId } = body;

    const admin = createAdminClient();

    const { error } = await admin.from('atc_calls')
      .update({ status: 'connected', connected_at: new Date().toISOString() })
      .eq('id', callId)
      .eq('to_user_id', user.id)
      .eq('status', 'ringing');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI answer:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
