import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * POST — Upload / changer le logo de la compagnie
 * FormData: file (image), compagnie_id
 * 
 * Comportement :
 *  - Seul le PDG ou un admin peut uploader
 *  - Le logo est stocké dans Supabase Storage (bucket cartes-identite, dossier compagnies/)
 *  - L'ancien logo est supprimé si présent
 *  - Le logo est automatiquement propagé aux cartes de TOUS les employés et du PDG
 *  - Exception : les cartes staff (couleur_fond = '#1F2937') ne sont PAS modifiées
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const compagnie_id = formData.get('compagnie_id') as string | null;

    if (!file || !compagnie_id) {
      return NextResponse.json({ error: 'Fichier et compagnie_id requis' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5 MB)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, logo_url')
      .eq('id', compagnie_id)
      .single();

    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut gérer le logo' }, { status: 403 });
    }

    // Supprimer l'ancien logo si présent
    if (compagnie.logo_url) {
      const urlParts = compagnie.logo_url.split('/cartes-identite/');
      if (urlParts.length >= 2) {
        await admin.storage.from('cartes-identite').remove([urlParts[1]]);
      }
    }

    // Upload du nouveau logo
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `compagnies/${compagnie_id}/logo-${Date.now()}.${ext}`;

    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from('cartes-identite')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage
      .from('cartes-identite')
      .getPublicUrl(fileName);

    // Sauvegarder l'URL dans la compagnie
    await admin.from('compagnies')
      .update({ logo_url: publicUrl })
      .eq('id', compagnie_id);

    // Propager le logo aux cartes des employés et du PDG
    // Récupérer tous les user_ids concernés (employés + PDG)
    const { data: employesData } = await admin
      .from('compagnie_employes')
      .select('pilote_id')
      .eq('compagnie_id', compagnie_id);

    const userIds = new Set<string>();
    // Ajouter le PDG
    if (compagnie.pdg_id) userIds.add(compagnie.pdg_id);
    // Ajouter les employés
    if (employesData) {
      for (const e of employesData) {
        userIds.add(e.pilote_id);
      }
    }

    // Mettre à jour les cartes SAUF les cartes staff (noir: #1F2937)
    if (userIds.size > 0) {
      const userIdsArr = Array.from(userIds);
      await admin
        .from('cartes_identite')
        .update({ logo_url: publicUrl })
        .in('user_id', userIdsArr)
        .neq('couleur_fond', '#1F2937'); // Exclure les cartes staff noires
    }

    return NextResponse.json({
      ok: true,
      logo_url: publicUrl,
      cartes_mises_a_jour: userIds.size,
    });
  } catch (e) {
    console.error('POST compagnies/logo:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE — Supprimer le logo de la compagnie
 * Body: { compagnie_id }
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const admin = createAdminClient();

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, logo_url')
      .eq('id', compagnie_id)
      .single();

    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut gérer le logo' }, { status: 403 });
    }

    // Supprimer du storage
    if (compagnie.logo_url) {
      const urlParts = compagnie.logo_url.split('/cartes-identite/');
      if (urlParts.length >= 2) {
        await admin.storage.from('cartes-identite').remove([urlParts[1]]);
      }

      // Retirer le logo des cartes qui l'utilisent
      await admin
        .from('cartes_identite')
        .update({ logo_url: null })
        .eq('logo_url', compagnie.logo_url);
    }

    // Supprimer l'URL de la compagnie
    await admin.from('compagnies')
      .update({ logo_url: null })
      .eq('id', compagnie_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE compagnies/logo:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
