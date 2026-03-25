import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// POST — supprimer les triches ET marquer les réponses normales comme examinées (admin)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode; // 'cheats_only' | 'all'

    const admin = createAdminClient();

    if (mode === 'all') {
      // Supprimer les triches/trashed/time_expired
      const { data: toDelete } = await admin
        .from('aeroschool_responses')
        .select('id')
        .eq('form_id', formId)
        .or('cheating_detected.eq.true,status.eq.trashed,status.eq.time_expired');

      let deleted = 0;
      if (toDelete?.length) {
        const ids = toDelete.map((r) => r.id);
        await admin.from('aeroschool_responses').delete().in('id', ids);
        deleted = ids.length;
      }

      // Marquer les submitted comme reviewed
      const { data: toReview } = await admin
        .from('aeroschool_responses')
        .select('id')
        .eq('form_id', formId)
        .eq('status', 'submitted');

      let reviewed = 0;
      if (toReview?.length) {
        const ids = toReview.map((r) => r.id);
        await admin.from('aeroschool_responses').update({ status: 'reviewed' }).in('id', ids);
        reviewed = ids.length;
      }

      return NextResponse.json({ ok: true, deleted, reviewed });
    }

    // Mode par défaut : supprimer uniquement les triches
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
