import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Vérifier les permissions (admin ou IFSA)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ifsa')
    .eq('id', user.id)
    .single();

  const canEdit = profile?.role === 'admin' || profile?.role === 'ifsa' || profile?.ifsa;
  if (!canEdit) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = formData.get('user_id') as string | null;
    const type = formData.get('type') as 'logo' | 'photo' | null;

    if (!file || !userId || !type) {
      return NextResponse.json({ error: 'Fichier, user_id et type requis' }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'user_id invalide' }, { status: 400 });
    }
    if (!['logo', 'photo'].includes(type)) {
      return NextResponse.json({ error: 'type invalide' }, { status: 400 });
    }

    // Vérifier le type de fichier
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 });
    }

    // Limiter la taille à 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5MB)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer l'ancienne URL pour la supprimer après
    let oldUrl: string | null = null;
    const { data: carteAvant } = await admin
      .from('cartes_identite')
      .select('logo_url, photo_url')
      .eq('user_id', userId)
      .maybeSingle();
    if (type === 'photo') {
      oldUrl = carteAvant?.photo_url || null;
    } else if (type === 'logo') {
      oldUrl = carteAvant?.logo_url || null;
    }

    // Nom du fichier unique
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${userId}/${type}-${Date.now()}.${ext}`;

    // Upload vers Supabase Storage
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('cartes-identite')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Obtenir l'URL publique
    const { data: { publicUrl } } = admin.storage
      .from('cartes-identite')
      .getPublicUrl(fileName);

    // Si on uploade un logo via cette route admin/IFSA, c'est un logo manuel
    // (l'admin force un logo pour cet utilisateur, qui ne sera plus recalcule en auto)
    if (type === 'logo') {
      await admin
        .from('cartes_identite')
        .update({
          logo_url: publicUrl,
          logo_source: 'manuel',
          logo_compagnie_id: null,
        })
        .eq('user_id', userId);
    } else if (type === 'photo') {
      await admin
        .from('cartes_identite')
        .update({ photo_url: publicUrl })
        .eq('user_id', userId);
    }

    // Supprimer l'ancien fichier de Storage pour economiser l'espace
    if (oldUrl) {
      try {
        const urlParts = oldUrl.split('/cartes-identite/');
        if (urlParts.length >= 2) {
          const oldPath = urlParts[1];
          // Ne pas supprimer si c'est dans le dossier 'logos/' partage
          if (!oldPath.startsWith('logos/')) {
            await admin.storage.from('cartes-identite').remove([oldPath]);
          }
        }
      } catch (e) {
        console.error('Erreur suppression ancien fichier:', e);
        // On continue meme si la suppression echoue
      }
    }

    return NextResponse.json({ url: publicUrl, path: uploadData.path });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 });
  }
}
