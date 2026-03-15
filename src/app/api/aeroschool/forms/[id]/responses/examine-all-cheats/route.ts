import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// POST — supprimer toutes les réponses marquées triche/trashed/time_expired (admin)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    const { data: toDelete, error: selectErr } = await admin
      .from('aeroschool_responses')
      .select('id')
      .eq('form_id', formId)
      .or('cheating_detected.eq.true,status.eq.trashed,status.eq.time_expired');

    if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 });
    if (!toDelete?.length) return NextResponse.json({ ok: true, deleted: 0 });

    const ids = toDelete.map((r) => r.id);
    const { error: deleteErr } = await admin
      .from('aeroschool_responses')
      .delete()
      .in('id', ids);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
