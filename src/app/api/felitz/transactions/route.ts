export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAlliancePresidentOrVice } from '@/lib/co-pdg-utils';
import { enrichTransactionsWithVban, fetchAllFelitzTransactions } from '@/lib/felitz/utils';

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
    const comp = compte.compagnies as { pdg_id?: string } | { pdg_id?: string }[] | null;
    const compPdg = Array.isArray(comp) ? comp[0]?.pdg_id : comp?.pdg_id;
    const isOwner = String(compte.proprietaire_id) === String(user.id);
    const isPdg = compPdg && String(compPdg) === String(user.id);
    let isCoPdg = false;
    if (compte.compagnie_id && !isPdg) {
      const { data: emp } = await admin
        .from('compagnie_employes')
        .select('id')
        .eq('compagnie_id', compte.compagnie_id)
        .eq('pilote_id', user.id)
        .eq('role', 'co_pdg')
        .maybeSingle();
      isCoPdg = Boolean(emp);
    }
    let isAllianceLeader = false;
    let isReparationPdg = false;
    if (compte.type === 'alliance' && compte.alliance_id) {
      isAllianceLeader = await isAlliancePresidentOrVice(user.id, compte.alliance_id, admin);
    }
    if (compte.entreprise_reparation_id) {
      const { data: ent } = await admin.from('entreprises_reparation')
        .select('pdg_id')
        .eq('id', compte.entreprise_reparation_id).single();
      isReparationPdg = !!(ent && String(ent.pdg_id) === String(user.id));
    }

    if (!isAdmin && !isOwner && !isPdg && !isCoPdg && !isAllianceLeader && !isReparationPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    let raw: Array<Record<string, unknown>>;
    try {
      raw = await fetchAllFelitzTransactions(admin, compteId);
    } catch {
      return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });
    }

    const data = await enrichTransactionsWithVban(admin, raw);

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

    if (type === 'debit') {
      const { data: debitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compte_id, p_montant: montant });
      if (!debitOk) {
        return NextResponse.json({ error: 'Solde insuffisant pour ce débit' }, { status: 400 });
      }
    } else {
      const { data: creditOk } = await admin.rpc('crediter_compte_safe', { p_compte_id: compte_id, p_montant: montant });
      if (!creditOk) {
        return NextResponse.json({ error: 'Erreur lors du crédit' }, { status: 500 });
      }
    }

    // Créer la transaction avec le nom de l'admin
    const libelleAvecAdmin = `[Admin: ${adminNom}] ${libelle}`;
    const { data: transaction, error } = await admin.from('felitz_transactions').insert({
      compte_id,
      type,
      montant,
      libelle: libelleAvecAdmin
    }).select().single();

    if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

    return NextResponse.json(transaction);
  } catch (e) {
    console.error('Felitz transactions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
