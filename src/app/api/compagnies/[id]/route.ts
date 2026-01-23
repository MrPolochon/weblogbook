import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    const { error } = await admin.from('compagnies').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnie delete error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    
    // Vérifier si l'utilisateur est PDG de cette compagnie
    const admin = createAdminClient();
    const { data: compagnie } = await admin.from('compagnies').select('pdg_id').eq('id', id).single();
    const isPdg = compagnie?.pdg_id === user.id;
    
    if (!isAdmin && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { pdg_id, prix_billet_pax, prix_kg_cargo, pourcentage_salaire } = body;

    const updates: Record<string, unknown> = {};
    
    // Seuls les admins peuvent changer le PDG
    if (pdg_id !== undefined && isAdmin) updates.pdg_id = pdg_id;
    
    // Le PDG et les admins peuvent modifier ces paramètres
    if (prix_billet_pax !== undefined) updates.prix_billet_pax = prix_billet_pax;
    if (prix_kg_cargo !== undefined) updates.prix_kg_cargo = prix_kg_cargo;
    if (pourcentage_salaire !== undefined) updates.pourcentage_salaire = pourcentage_salaire;

    const { data, error } = await admin.from('compagnies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie update error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data, error } = await supabase.from('compagnies')
      .select('*, profiles!compagnies_pdg_id_fkey(identifiant)')
      .eq('id', id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
