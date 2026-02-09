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
    
    // Nom du fichier unique
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${userId}/${type}-${Date.now()}.${ext}`;

    // Upload vers Supabase Storage
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

    return NextResponse.json({ url: publicUrl, path: uploadData.path });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 });
  }
}
