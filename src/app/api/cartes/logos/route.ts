import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Liste tous les logos disponibles (dans le dossier logos/)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Lister les fichiers dans le dossier logos/
  const { data: files, error } = await admin.storage
    .from('cartes-identite')
    .list('logos', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Construire les URLs publiques
  const logos = (files || [])
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => {
      const { data: { publicUrl } } = admin.storage
        .from('cartes-identite')
        .getPublicUrl(`logos/${f.name}`);
      return {
        name: f.name,
        url: publicUrl,
        created_at: f.created_at,
      };
    });

  return NextResponse.json({ logos });
}

// POST - Upload un nouveau logo partagé
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

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5MB)' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Nom unique pour le logo
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `logos/logo-${Date.now()}.${ext}`;

    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('cartes-identite')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage
      .from('cartes-identite')
      .getPublicUrl(fileName);

    return NextResponse.json({ url: publicUrl, path: uploadData.path });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 });
  }
}

// DELETE - Supprimer un logo (et le retirer de toutes les cartes)
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Seuls les admins peuvent supprimer
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const logoUrl = searchParams.get('url');

  if (!logoUrl) {
    return NextResponse.json({ error: 'URL du logo requise' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Extraire le chemin du fichier depuis l'URL
  const urlParts = logoUrl.split('/cartes-identite/');
  if (urlParts.length < 2) {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
  }
  const filePath = urlParts[1];

  // Supprimer le fichier de Storage
  const { error: deleteError } = await admin.storage
    .from('cartes-identite')
    .remove([filePath]);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Retirer ce logo de toutes les cartes qui l'utilisent
  await admin
    .from('cartes_identite')
    .update({ logo_url: null })
    .eq('logo_url', logoUrl);

  return NextResponse.json({ ok: true });
}
