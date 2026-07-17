export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from('messages')
      .update({ lu: true })
      .eq('destinataire_id', user.id)
      .in('id', ids)
      .eq('lu', false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('marquer-tout-lu:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
