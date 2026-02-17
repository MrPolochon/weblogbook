import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Récupérer les transactions d'un compte
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compteId = searchParams.get('compte_id');

    if (!compteId) {
      return NextResponse.json({ error: 'compte_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Vérifier accès au compte
    const { data: compte } = await admin.from('felitz_comptes')
      .select('*, compagnies(pdg_id)')
      .eq('id', compteId)
      .single();

    if (!compte) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isOwner = compte.proprietaire_id === user.id;
    const isPdg = compte.compagnies?.pdg_id === user.id;

    if (!isAdmin && !isOwner && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data, error } = await admin.from('felitz_transactions')
      .select('*')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Felitz transactions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Ajouter une transaction (admin uniquement)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, identifiant').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { compte_id, type, montant, libelle } = body;

    if (!compte_id || !type || !montant || montant <= 0 || !libelle) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }

    if (!['credit', 'debit'].includes(type)) {
      return NextResponse.json({ error: 'Type invalide (credit ou debit)' }, { status: 400 });
    }

    const admin = createAdminClient();
    const adminNom = profile?.identifiant || 'Admin';

    // Récupérer le solde actuel
    const { data: compte } = await admin.from('felitz_comptes')
      .select('solde')
      .eq('id', compte_id)
      .single();

    if (!compte) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
    }

    // Calculer nouveau solde
    const newSolde = type === 'credit' 
      ? compte.solde + montant 
      : compte.solde - montant;

    if (newSolde < 0) {
      return NextResponse.json({ error: 'Solde insuffisant pour ce débit' }, { status: 400 });
    }

    // Mettre à jour le solde avec vérification atomique (optimistic locking)
    const { data: updateResult, error: updateError } = await admin.from('felitz_comptes')
      .update({ solde: newSolde })
      .eq('id', compte_id)
      .eq('solde', compte.solde) // Vérifier que le solde n'a pas changé
      .select('id');

    if (updateError || !updateResult || updateResult.length === 0) {
      return NextResponse.json({ error: 'Le solde a été modifié. Réessayez.' }, { status: 409 });
    }

    // Créer la transaction avec le nom de l'admin
    const libelleAvecAdmin = `[Admin: ${adminNom}] ${libelle}`;
    const { data: transaction, error } = await admin.from('felitz_transactions').insert({
      compte_id,
      type,
      montant,
      libelle: libelleAvecAdmin
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(transaction);
  } catch (e) {
    console.error('Felitz transactions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
