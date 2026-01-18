import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const BUCKET = 'documents';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: file, error: e } = await supabase
      .from('document_files')
      .select('storage_path, nom_original')
      .eq('id', id)
      .single();

    if (e || !file) return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });

    const admin = createAdminClient();
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(file.storage_path, 60);
    if (!signed?.signedUrl) return NextResponse.json({ error: 'Fichier inaccessible' }, { status: 500 });

    return NextResponse.redirect(signed.signedUrl);
  } catch (err) {
    console.error('Document download error:', err);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
