import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const BUCKET = 'documents';
const MAX_SIZE = 20 * 1024 * 1024; // 20 Mo

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const fd = await request.formData();
    const file = fd.get('file') as File | null;
    const sectionId = fd.get('section_id') as string | null;
    if (!file || !sectionId) return NextResponse.json({ error: 'Fichier et section requis' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Fichier trop volumineux (max 20 Mo)' }, { status: 400 });

    const ext = (file.name.split('.').pop() || '').slice(0, 20);
    const base = file.name.slice(0, -(ext.length + 1)) || 'fichier';
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const uuid = crypto.randomUUID().slice(0, 8);
    const storagePath = `${sectionId}/${uuid}_${safe}.${ext || 'bin'}`;

    const admin = createAdminClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

    if (upErr) return NextResponse.json({ error: upErr.message || 'Erreur upload' }, { status: 400 });

    const { error: insErr } = await admin.from('document_files').insert({
      section_id: sectionId,
      nom_original: file.name,
      storage_path: storagePath,
      taille_bytes: file.size,
      uploaded_by: user.id,
    });

    if (insErr) {
      try { await admin.storage.from(BUCKET).remove([storagePath]); } catch { /* ignore */ }
      return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
