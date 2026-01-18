import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const BUCKET = 'documents';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    const { data: file } = await admin.from('document_files').select('storage_path').eq('id', id).single();
    if (file?.storage_path) {
      try { await admin.storage.from(BUCKET).remove([file.storage_path]); } catch { /* ignore */ }
    }
    await admin.from('document_files').delete().eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('File delete error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
