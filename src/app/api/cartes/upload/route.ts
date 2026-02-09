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
    if (type === 'photo') {
      const { data: carte } = await admin
        .from('cartes_identite')
        .select('photo_url')
        .eq('user_id', userId)
        .single();
      oldUrl = carte?.photo_url || null;
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

    // Supprimer l'ancienne photo de Storage pour économiser l'espace
    if (oldUrl && type === 'photo') {
      try {
        const urlParts = oldUrl.split('/cartes-identite/');
        if (urlParts.length >= 2) {
          const oldPath = urlParts[1];
          await admin.storage.from('cartes-identite').remove([oldPath]);
        }
      } catch (e) {
        console.error('Erreur suppression ancienne photo:', e);
        // On continue même si la suppression échoue
      }
    }

    return NextResponse.json({ url: publicUrl, path: uploadData.path });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 });
  }
}
