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
    const comp = compte.compagnies as { pdg_id?: string } | { pdg_id?: string }[] | null;
    const compPdg = Array.isArray(comp) ? comp[0]?.pdg_id : comp?.pdg_id;
    const isOwner = String(compte.proprietaire_id) === String(user.id);
    const isPdg = compPdg && String(compPdg) === String(user.id);
    let isAllianceLeader = false;
    let isReparationPdg = false;
    if (compte.alliance_id) {
      const { data: userComp } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
      const compIds = (userComp || []).map(c => c.id);
      if (compIds.length > 0) {
        const { data: amList } = await admin.from('alliance_membres')
          .select('role')
          .eq('alliance_id', compte.alliance_id)
          .in('compagnie_id', compIds)
          .limit(1);
        const am = amList?.[0];
        isAllianceLeader = !!am && ['president', 'vice_president'].includes(am.role || '');
      }
    }
    if (compte.entreprise_reparation_id) {
      const { data: ent } = await admin.from('entreprises_reparation')
        .select('pdg_id')
        .eq('id', compte.entreprise_reparation_id).single();
      isReparationPdg = !!(ent && String(ent.pdg_id) === String(user.id));
    }

    if (!isAdmin && !isOwner && !isPdg && !isAllianceLeader && !isReparationPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data: raw, error } = await admin.from('felitz_transactions')
      .select('*')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Enrichir les libellés : remplacer les UUID par les VBAN quand possible
    const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const toResolve = new Set<string>();
    (raw || []).forEach((t: { libelle?: string | null }) => {
      const m = (t.libelle || '').match(UUID_REGEX);
      m?.forEach(u => toResolve.add(u));
    });

    const vbanByUuid: Record<string, string> = {};
    if (toResolve.size > 0) {
      const ids = Array.from(toResolve);
      const { data: comptesId } = await admin.from('felitz_comptes')
        .select('id, vban')
        .in('id', ids);
      (comptesId || []).forEach((c: { id: string; vban: string }) => {
        if (c.id) vbanByUuid[c.id] = c.vban;
      });
      const { data: comptesComp } = await admin.from('felitz_comptes')
        .select('compagnie_id, vban')
        .in('compagnie_id', ids);
      (comptesComp || []).forEach((c: { compagnie_id: string; vban: string }) => {
        if (c.compagnie_id) vbanByUuid[c.compagnie_id] = c.vban;
      });
      const { data: comptesPerso } = await admin.from('felitz_comptes')
        .select('proprietaire_id, vban')
        .in('proprietaire_id', ids);
      (comptesPerso || []).forEach((c: { proprietaire_id: string; vban: string }) => {
        if (c.proprietaire_id) vbanByUuid[c.proprietaire_id] = c.vban;
      });
      const { data: comptesAlliance } = await admin.from('felitz_comptes')
        .select('alliance_id, vban')
        .in('alliance_id', ids);
      (comptesAlliance || []).forEach((c: { alliance_id: string; vban: string }) => {
        if (c.alliance_id) vbanByUuid[c.alliance_id] = c.vban;
      });
      const { data: comptesRep } = await admin.from('felitz_comptes')
        .select('entreprise_reparation_id, vban')
        .in('entreprise_reparation_id', ids);
      (comptesRep || []).forEach((c: { entreprise_reparation_id: string; vban: string }) => {
        if (c.entreprise_reparation_id) vbanByUuid[c.entreprise_reparation_id] = c.vban;
      });
    }

    const data = (raw || []).map((t: { libelle?: string | null; [k: string]: unknown }) => {
      let libelle = t.libelle || '';
      for (const [uuid, vban] of Object.entries(vbanByUuid)) {
        const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        libelle = libelle.replace(new RegExp(escaped, 'gi'), vban);
      }
      return { ...t, libelle };
    });

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

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(transaction);
  } catch (e) {
    console.error('Felitz transactions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
