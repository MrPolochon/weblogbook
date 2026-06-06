import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'cartes-identite';
const MAX_SIZE_MB = 8;

/** POST /api/incidents/[id]/photos — upload une photo vers Storage. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Autorisé : admin, IFSA, ATC (qui signale l'incident)
    const { data: profile } = await supabase.from('profiles')
      .select('role, ifsa, atc').eq('id', user.id).single();
    const canUpload = profile?.role === 'admin' || Boolean(profile?.ifsa) ||
      profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canUpload) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: incident } = await admin.from('incidents_vol')
      .select('id, images_urls, statut').eq('id', id).single();
    if (!incident) return NextResponse.json({ error: 'Incident introuvable.' }, { status: 404 });
    if (incident.statut === 'clos') return NextResponse.json({ error: 'Incident déjà clôturé.' }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get('photo') as File | null;
    if (!file || !file.size) return NextResponse.json({ error: 'Aucun fichier fourni.' }, { status: 400 });
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).` }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Seules les images sont acceptées.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `incidents/${id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadErr) {
      console.error('Upload incident photo:', uploadErr);
      return NextResponse.json({ error: 'Erreur lors de l\'upload.' }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const existingUrls: string[] = incident.images_urls || [];
    await admin.from('incidents_vol').update({
      images_urls: [...existingUrls, publicUrl],
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    console.error('POST /api/incidents/[id]/photos:', e);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}

/** DELETE /api/incidents/[id]/photos — supprime toutes les photos d'un incident. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
    if (profile?.role !== 'admin' && !profile?.ifsa) {
      return NextResponse.json({ error: 'Admin/IFSA requis.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: incident } = await admin.from('incidents_vol')
      .select('images_urls').eq('id', id).single();

    const urls: string[] = incident?.images_urls || [];
    if (urls.length > 0) {
      // Extraire les paths relatifs depuis les URLs publiques
      const paths = urls.map(url => {
        const match = url.match(/\/storage\/v1\/object\/public\/cartes-identite\/(.+)$/);
        return match ? match[1] : null;
      }).filter((p): p is string => Boolean(p));

      if (paths.length > 0) {
        const { error: removeErr } = await admin.storage.from(BUCKET).remove(paths);
        if (removeErr) console.warn('Delete incident photos warning:', removeErr.message);
      }

      await admin.from('incidents_vol').update({
        images_urls: [],
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }

    return NextResponse.json({ ok: true, deleted: urls.length });
  } catch (e) {
    console.error('DELETE /api/incidents/[id]/photos:', e);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
