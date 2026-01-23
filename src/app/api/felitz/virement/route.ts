import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST - Effectuer un virement
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { compte_source_id, vban_destination, montant, libelle } = body;

    if (!compte_source_id || !vban_destination || !montant || montant <= 0) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur a accès au compte source
    const { data: compteSource } = await admin.from('felitz_comptes')
      .select('*, compagnies(pdg_id)')
      .eq('id', compte_source_id)
      .single();

    if (!compteSource) {
      return NextResponse.json({ error: 'Compte source introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    // Vérifier autorisation
    const isOwner = compteSource.proprietaire_id === user.id;
    const isPdg = compteSource.compagnies?.pdg_id === user.id;
    
    if (!isAdmin && !isOwner && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé pour ce compte' }, { status: 403 });
    }

    // Vérifier solde suffisant
    if (compteSource.solde < montant) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Trouver le compte destination
    const { data: compteDest } = await admin.from('felitz_comptes')
      .select('id')
      .eq('vban', vban_destination)
      .single();

    if (!compteDest) {
      return NextResponse.json({ error: 'VBAN destination introuvable' }, { status: 404 });
    }

    // Effectuer les opérations atomiques
    // 1. Débiter source
    const { error: debitError } = await admin.from('felitz_comptes')
      .update({ solde: compteSource.solde - montant })
      .eq('id', compte_source_id);

    if (debitError) throw debitError;

    // 2. Créditer destination
    const { data: destData } = await admin.from('felitz_comptes')
      .select('solde')
      .eq('id', compteDest.id)
      .single();

    await admin.from('felitz_comptes')
      .update({ solde: (destData?.solde || 0) + montant })
      .eq('id', compteDest.id);

    // 3. Créer les transactions
    const libelleVirement = libelle || 'Virement';
    
    await admin.from('felitz_transactions').insert([
      {
        compte_id: compte_source_id,
        type: 'debit',
        montant,
        libelle: `${libelleVirement} vers ${vban_destination}`
      },
      {
        compte_id: compteDest.id,
        type: 'credit',
        montant,
        libelle: `${libelleVirement} de ${compteSource.vban}`
      }
    ]);

    // 4. Enregistrer le virement
    const { data: virement, error: virementError } = await admin.from('felitz_virements').insert({
      compte_source_id,
      compte_dest_vban: vban_destination,
      montant,
      libelle,
      created_by: user.id
    }).select().single();

    if (virementError) throw virementError;

    return NextResponse.json({ ok: true, virement });
  } catch (e) {
    console.error('Felitz virement POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET - Historique des virements
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compteId = searchParams.get('compte_id');

    const admin = createAdminClient();
    let query = admin.from('felitz_virements')
      .select('*')
      .order('created_at', { ascending: false });

    if (compteId) {
      query = query.eq('compte_source_id', compteId);
    } else {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query.limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Felitz virement GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
