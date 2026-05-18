import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { isCoPdg } from '@/lib/co-pdg-utils';

const BUCKET = 'cartes-identite';
const FOLDER = 'avions';

function pathFromUrl(url: string): string | null {
  const parts = url.split(`/${BUCKET}/`);
  return parts.length >= 2 ? parts[1] : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5 Mo)' }, { status: 400 });

    const admin = createAdminClient();

    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, avion_image_url')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('pdg_id')
      .eq('id', avion.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isLeader = compagnie?.pdg_id === user.id || (await isCoPdg(user.id, avion.compagnie_id, admin));
    if (!isLeader && profile?.role !== 'admin')
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    // Supprimer l'ancienne image si présente
    if (avion.avion_image_url) {
      const oldPath = pathFromUrl(avion.avion_image_url);
      if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
    }

    // Upload de la nouvelle image
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${FOLDER}/${id}/photo-${Date.now()}.${ext}`;
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: file.type, upsert: true });
    if (uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(fileName);

    await admin.from('compagnie_avions')
      .update({ avion_image_url: publicUrl })
      .eq('id', id);

    return NextResponse.json({ ok: true, avion_image_url: publicUrl });
  } catch (e) {
    console.error('POST avion image:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, avion_image_url')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('pdg_id')
      .eq('id', avion.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isLeader = compagnie?.pdg_id === user.id || (await isCoPdg(user.id, avion.compagnie_id, admin));
    if (!isLeader && profile?.role !== 'admin')
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    if (avion.avion_image_url) {
      const oldPath = pathFromUrl(avion.avion_image_url);
      if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
    }

    await admin.from('compagnie_avions')
      .update({ avion_image_url: null })
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE avion image:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
