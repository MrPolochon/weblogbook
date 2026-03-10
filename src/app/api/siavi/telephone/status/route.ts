import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const callId = request.nextUrl.searchParams.get('callId');
    if (!callId) return NextResponse.json({ error: 'callId requis' }, { status: 400 });

    const admin = createAdminClient();

    const { data: call } = await admin.from('atc_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (!call) return NextResponse.json({ call: null, status: 'ended' });

    if (call.from_user_id !== user.id && call.to_user_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    return NextResponse.json({ call, status: call.status });
  } catch (err) {
    console.error('SIAVI status:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
