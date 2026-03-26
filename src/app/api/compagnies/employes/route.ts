import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Liste des employés d'une compagnie
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compagnieId = searchParams.get('compagnie_id');
    const piloteId = searchParams.get('pilote_id');

    const admin = createAdminClient();
    let query = admin.from('compagnie_employes')
      .select('*, profiles(id, identifiant), compagnies(id, nom, pdg_id)');

    if (compagnieId) {
      query = query.eq('compagnie_id', compagnieId);
    }
    if (piloteId) {
      query = query.eq('pilote_id', piloteId);
    }

    const { data, error } = await query.order('date_embauche', { ascending: false });
    if (error) return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie employes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Ajouter un employé à une compagnie (admin uniquement)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { compagnie_id, pilote_id } = body;

    if (!compagnie_id || !pilote_id) {
      return NextResponse.json({ error: 'compagnie_id et pilote_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier si le pilote n'est pas déjà employé dans CETTE compagnie (mais peut être dans d'autres)
    const { data: existingEmploye } = await admin.from('compagnie_employes')
      .select('id, compagnies(nom)')
      .eq('pilote_id', pilote_id)
      .eq('compagnie_id', compagnie_id)
      .single();

    if (existingEmploye) {
      return NextResponse.json({ 
        error: `Ce pilote est déjà employé dans cette compagnie` 
      }, { status: 400 });
    }

    const { data, error } = await admin.from('compagnie_employes').insert({
      compagnie_id,
      pilote_id
    }).select('*, profiles(identifiant), compagnies(nom)').single();

    if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie employes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Changer le rôle d'un employé (PDG de la compagnie uniquement)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { id, role } = body;
    if (!id || !role || !['employe', 'co_pdg'].includes(role)) {
      return NextResponse.json({ error: 'id et role (employe | co_pdg) requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: employe } = await admin.from('compagnie_employes')
      .select('id, compagnie_id, pilote_id, role')
      .eq('id', id)
      .single();
    if (!employe) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });

    const { data: compagnie } = await admin.from('compagnies')
      .select('id, pdg_id')
      .eq('id', employe.compagnie_id)
      .single();
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut modifier les rôles' }, { status: 403 });
    }

    const { error } = await admin.from('compagnie_employes')
      .update({ role })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 400 });

    return NextResponse.json({ ok: true, role });
  } catch (e) {
    console.error('Compagnie employes PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Retirer un employé d'une compagnie (admin uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('compagnie_employes').delete().eq('id', id);

    if (error) return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnie employes DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
