import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { nom, ordre, parent_id, move } = body;

    // Déplacement de dossier (changer parent_id)
    if (move === true) {
      const newParent = parent_id === null || parent_id === undefined ? null : String(parent_id);
      // Empêcher de déplacer un dossier dans lui-même
      if (newParent === id) return NextResponse.json({ error: 'Impossible de déplacer un dossier dans lui-même.' }, { status: 400 });
      const { error: moveErr } = await supabase.from('document_sections').update({ parent_id: newParent }).eq('id', id);
      if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!nom || typeof nom !== 'string' || !nom.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

    const update: Record<string, unknown> = { nom: nom.trim() };
    if (typeof ordre === 'number') update.ordre = ordre;

    const { error } = await supabase.from('document_sections').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Section update error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    const BUCKET = 'documents';

    const { data: files } = await admin.from('document_files').select('id, storage_path').eq('section_id', id);
    for (const f of files || []) {
      try { await admin.storage.from(BUCKET).remove([f.storage_path]); } catch { /* ignore */ }
    }
    await admin.from('document_files').delete().eq('section_id', id);
    await admin.from('document_sections').delete().eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Section delete error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
