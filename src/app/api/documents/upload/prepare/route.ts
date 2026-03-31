import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import {
  DOCUMENTS_BUCKET,
  DOCUMENTS_MAX_BYTES,
  buildDocumentsStoragePath,
  requireAdmin,
} from '@/lib/documents-upload';

/** Prépare un upload direct vers Storage (contourne la limite de taille du corps HTTP sur Vercel, etc.). */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      section_id?: string;
      filename?: string;
      size?: number;
    };
    const sectionId = body.section_id?.trim();
    const filename = body.filename?.trim();
    const size = typeof body.size === 'number' ? body.size : NaN;
    if (!sectionId || !filename) {
      return NextResponse.json({ error: 'section_id et filename requis' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'Taille de fichier invalide' }, { status: 400 });
    }
    if (size > DOCUMENTS_MAX_BYTES) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 20 Mo)' }, { status: 400 });
    }

    const storagePath = buildDocumentsStoragePath(sectionId, filename);
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error) {
      const msg = error.message || JSON.stringify(error);
      return NextResponse.json({ error: msg || 'Impossible de préparer le téléversement' }, { status: 400 });
    }

    return NextResponse.json({
      path: data.path,
      token: data.token,
    });
  } catch (e) {
    console.error('upload prepare:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
