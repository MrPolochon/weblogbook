import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Récupérer une carte par user_id
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');

  const admin = createAdminClient();
  
  if (userId) {
    // Récupérer une carte spécifique
    const { data, error } = await admin
      .from('cartes_identite')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } else {
    // Récupérer toutes les cartes
    const { data, error } = await admin
      .from('cartes_identite')
      .select('*, profiles(identifiant)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  }
}

// POST - Créer ou mettre à jour une carte
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

  const body = await request.json();
  const { user_id, ...carteData } = body;

  if (!user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier si une carte existe déjà
  const { data: existingCarte } = await admin
    .from('cartes_identite')
    .select('id')
    .eq('user_id', user_id)
    .single();

  let result;
  if (existingCarte) {
    // Mettre à jour
    result = await admin
      .from('cartes_identite')
      .update({ ...carteData, updated_by: user.id })
      .eq('user_id', user_id)
      .select()
      .single();
  } else {
    // Créer
    result = await admin
      .from('cartes_identite')
      .insert({ user_id, ...carteData, updated_by: user.id })
      .select()
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ data: result.data, ok: true });
}

// DELETE - Supprimer une carte
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
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('cartes_identite')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
