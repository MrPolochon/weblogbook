import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { DOCUMENTS_BUCKET, requireAdmin } from '@/lib/documents-upload';

/** Enregistre le fichier en base après upload direct vers Storage. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      section_id?: string;
      storage_path?: string;
      nom_original?: string;
      taille_bytes?: number;
    };
    const sectionId = body.section_id?.trim();
    const storagePath = body.storage_path?.trim();
    const nomOriginal = body.nom_original?.trim();
    const taille = typeof body.taille_bytes === 'number' ? body.taille_bytes : NaN;

    if (!sectionId || !storagePath || !nomOriginal) {
      return NextResponse.json({ error: 'Données incomplètes' }, { status: 400 });
    }
    if (!Number.isFinite(taille) || taille <= 0) {
      return NextResponse.json({ error: 'Taille invalide' }, { status: 400 });
    }
    if (!storagePath.startsWith(`${sectionId}/`)) {
      return NextResponse.json({ error: 'Chemin incohérent avec la section' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error: insErr } = await admin.from('document_files').insert({
      section_id: sectionId,
      nom_original: nomOriginal,
      storage_path: storagePath,
      taille_bytes: taille,
      uploaded_by: auth.userId,
    });

    if (insErr) {
      try {
        await admin.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
      } catch {
        /* ignore */
      }
      const msg = insErr.message || JSON.stringify(insErr);
      return NextResponse.json({ error: msg || 'Erreur enregistrement' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('upload complete:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
