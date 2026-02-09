import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST - Permet à un pilote de modifier SA photo de profil uniquement
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
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
    
    // Upload vers Supabase Storage
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${user.id}/photo-${Date.now()}.${ext}`;

    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('cartes-identite')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Obtenir l'URL publique
    const { data: { publicUrl } } = admin.storage
      .from('cartes-identite')
      .getPublicUrl(fileName);

    // Vérifier si une carte existe déjà pour cet utilisateur
    const { data: existingCarte } = await admin
      .from('cartes_identite')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingCarte) {
      // Mettre à jour seulement la photo
      await admin
        .from('cartes_identite')
        .update({ photo_url: publicUrl })
        .eq('user_id', user.id);
    } else {
      // Créer une nouvelle carte avec juste la photo
      await admin
        .from('cartes_identite')
        .insert({ 
          user_id: user.id, 
          photo_url: publicUrl,
          titre: 'IFSA',
          couleur_fond: '#DC2626'
        });
    }

    return NextResponse.json({ url: publicUrl, path: uploadData.path, ok: true });
  } catch (err) {
    console.error('Ma photo error:', err);
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 });
  }
}
