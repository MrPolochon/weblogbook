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
    const { compte_source_id, vban_destination, montant: rawMontant, libelle } = body;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!compte_source_id || !UUID_REGEX.test(String(compte_source_id))) {
      return NextResponse.json({ error: 'compte_source_id invalide' }, { status: 400 });
    }
    if (!vban_destination || typeof vban_destination !== 'string' || vban_destination.length > 30) {
      return NextResponse.json({ error: 'vban_destination invalide' }, { status: 400 });
    }
    const montant = Number(rawMontant);
    if (!Number.isFinite(montant) || montant <= 0 || montant > 999_999_999 || Math.floor(montant) !== montant) {
      return NextResponse.json({ error: 'Montant invalide (entier positif requis)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur a accès au compte source (sans join pour éviter les soucis avec compagnie_id null sur comptes personnels)
    const { data: compteSource } = await admin.from('felitz_comptes')
      .select('id, solde, vban, type, proprietaire_id, compagnie_id')
      .eq('id', compte_source_id)
      .single();

    if (!compteSource) {
      return NextResponse.json({ error: 'Compte source introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    // Vérifier autorisation : propriétaire (personnel) ou PDG (entreprise)
    const isOwner = compteSource.proprietaire_id === user.id;
    let isPdg = false;
    if (compteSource.compagnie_id) {
      const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', compteSource.compagnie_id).single();
      isPdg = comp?.pdg_id === user.id;
    }

    if (!isAdmin && !isOwner && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé pour ce compte' }, { status: 403 });
    }

    // Vérifier solde suffisant
    if (compteSource.solde < montant) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Trouver le compte destination
    const { data: compteDest } = await admin.from('felitz_comptes')
      .select('id, solde, vban')
      .eq('vban', vban_destination)
      .single();

    if (!compteDest) {
      return NextResponse.json({ error: 'VBAN destination introuvable' }, { status: 404 });
    }

    // Interdire virement vers le même compte
    if (compteSource.id === compteDest.id) {
      return NextResponse.json({ error: 'Virement vers le même compte impossible' }, { status: 400 });
    }

    // Débit atomique via RPC (SET solde = solde - montant WHERE solde >= montant)
    const { data: debitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compte_source_id, p_montant: montant });
    if (!debitOk) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Crédit atomique via RPC (SET solde = solde + montant)
    const { data: creditOk } = await admin.rpc('crediter_compte_safe', { p_compte_id: compteDest.id, p_montant: montant });
    if (!creditOk) {
      // Rollback le débit
      await admin.rpc('crediter_compte_safe', { p_compte_id: compte_source_id, p_montant: montant });
      return NextResponse.json({ error: 'Erreur lors du crédit. Virement annulé.' }, { status: 500 });
    }

    // Créer les transactions
    const libelleVirement = libelle || 'Virement';
    
    const { error: txError } = await admin.from('felitz_transactions').insert([
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

    if (txError) {
      console.error('Erreur création transactions:', txError);
      // Ne pas rollback ici car l'argent a déjà été transféré
    }

    // Enregistrer le virement
    const { data: virement, error: virementError } = await admin.from('felitz_virements').insert({
      compte_source_id,
      compte_dest_vban: vban_destination,
      montant,
      libelle,
      created_by: user.id
    }).select().single();

    if (virementError) {
      console.error('Erreur enregistrement virement:', virementError);
      // Ne pas retourner d'erreur car le virement a réussi
    }

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
    if (compteId) {
      const { data: compte } = await admin.from('felitz_comptes')
        .select('id, proprietaire_id, compagnie_id')
        .eq('id', compteId).single();
      if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isOwner = compte.proprietaire_id === user.id;
      let isPdg = false;
      if (compte.compagnie_id) {
        const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', compte.compagnie_id).single();
        isPdg = comp?.pdg_id === user.id;
      }
      if (!isAdmin && !isOwner && !isPdg) {
        return NextResponse.json({ error: 'Non autorisé pour ce compte' }, { status: 403 });
      }
    }

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
