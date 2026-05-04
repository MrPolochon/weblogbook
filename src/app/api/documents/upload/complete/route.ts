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
    // Limite la taille (50 Mo) — défense en profondeur ; le bucket peut avoir sa propre limite.
    const MAX_BYTES = 50 * 1024 * 1024;
    if (!Number.isFinite(taille) || taille <= 0 || taille > MAX_BYTES) {
      return NextResponse.json({ error: 'Taille invalide (max 50 Mo).' }, { status: 400 });
    }
    // Validation stricte du sectionId : empêche '..' ou '/' qui permettraient un path traversal.
    if (!/^[a-zA-Z0-9_-]+$/.test(sectionId)) {
      return NextResponse.json({ error: 'section_id invalide' }, { status: 400 });
    }
    // Validation stricte du storage_path : doit commencer par sectionId/, ne pas contenir
    // de '..' ni de '\' (qui pourraient sortir du préfixe), et avoir une extension de fichier.
    const expectedPrefix = `${sectionId}/`;
    if (
      !storagePath.startsWith(expectedPrefix) ||
      storagePath.includes('..') ||
      storagePath.includes('\\') ||
      storagePath.includes('//') ||
      storagePath.length > 512
    ) {
      return NextResponse.json({ error: 'Chemin de stockage invalide' }, { status: 400 });
    }
    // Le reste du chemin (après sectionId/) doit aussi être en charset sûr.
    const remainder = storagePath.slice(expectedPrefix.length);
    if (!/^[a-zA-Z0-9._\-/ ]+$/.test(remainder) || remainder.length === 0) {
      return NextResponse.json({ error: 'Chemin de stockage invalide' }, { status: 400 });
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
