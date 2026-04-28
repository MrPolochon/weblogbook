import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { OPTIONS_PRETS, calculerMontantTotalPret, TAUX_PRELEVEMENT_PRET, getEcheanceJours } from '@/lib/compagnie-utils';
import { isCoPdg } from '@/lib/co-pdg-utils';

/** F$ entier — PostgREST peut renvoyer des BIGINT en string : jamais utiliser + avec des strings brutes. */
function montantF$(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function serialiserPretClient(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    ...row,
    montant_emprunte: montantF$(row.montant_emprunte),
    montant_total_du: montantF$(row.montant_total_du),
    montant_rembourse: montantF$(row.montant_rembourse),
    taux_interet: Number(row.taux_interet),
  };
}

// PATCH - Rembourser manuellement une partie du prêt
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const montantRaw = body?.montant;

    // Accepte un nombre ou une chaîne ("1 000", "1000", "1000 F$")
    // et refuse explicitement les formats ambigus/invalides.
    const parseMontant = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const n = Math.max(0, Math.round(value));
        if (n <= 0) return null;
        return n;
      }
      if (typeof value !== 'string') return null;

      const cleaned = value
        .trim()
        .replace(/[Ff]\$/g, '')
        .replace(/\$/g, '')
        .replace(/[\s\u00A0\u202F]/g, '');

      // Chiffres uniquement (supporte 1 000, 1.000, 1,000 en saisie)
      const digits = cleaned.replace(/\D/g, '');
      if (!digits) return null;
      const n = Number.parseInt(digits, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    };

    const montant = parseMontant(montantRaw);
    if (!montant) {
      return NextResponse.json(
        { error: 'Montant invalide. Entrez un nombre entier positif (ex: 1, 1000).' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id || await isCoPdg(user.id, id, admin);

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Seul le PDG ou le co-PDG peut rembourser le prêt' }, { status: 403 });
    }

    // Récupérer le prêt actif
    const { data: pret } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pret) {
      return NextResponse.json({ error: 'Aucun prêt actif à rembourser' }, { status: 404 });
    }

    const totalDu = montantF$(pret.montant_total_du);
    const dejaRembourse = montantF$(pret.montant_rembourse);

    // Entiers (F$) : éviter concaténation string+number et restes flottants fantômes
    const resteARembourser = Math.max(0, totalDu - dejaRembourse);
    if (resteARembourser <= 0) {
      await admin
        .from('prets_bancaires')
        .update({
          montant_rembourse: totalDu,
          statut: 'rembourse',
          rembourse_at: new Date().toISOString(),
        })
        .eq('id', pret.id);

      return NextResponse.json({
        ok: true,
        message: 'Le prêt était déjà soldé. Son statut a été corrigé automatiquement.',
        montantRembourse: 0,
        resteARembourser: 0,
        pretRembourse: true,
      });
    }

    const montantEffectif = Math.min(montant, resteARembourser);

    if (montantEffectif <= 0) {
      return NextResponse.json({ error: 'Le prêt est déjà entièrement remboursé' }, { status: 400 });
    }

    const montantDebitInt = Math.trunc(montantEffectif);

    // Vérifier le solde du compte de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', id)
      .eq('type', 'entreprise')
      .single();

    if (!compteCompagnie) {
      return NextResponse.json({ error: 'Compte de la compagnie introuvable' }, { status: 404 });
    }

    const soldeNum = Math.trunc(Number(compteCompagnie.solde));
    if (!Number.isFinite(soldeNum)) {
      return NextResponse.json({ error: 'Erreur lors de la lecture du solde du compte' }, { status: 500 });
    }
    if (soldeNum < montantDebitInt) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Disponible: ${soldeNum.toLocaleString('fr-FR')} F$, requis: ${montantDebitInt.toLocaleString('fr-FR')} F$` 
      }, { status: 400 });
    }

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compteCompagnie.id, p_montant: montantDebitInt });
    if (!debitOk) {
      return NextResponse.json({ error: 'Solde insuffisant ou compte modifié' }, { status: 400 });
    }

    // Mettre à jour le prêt (plafonner au total dû pour clôturer proprement)
    const nouveauMontantRembourse = Math.min(dejaRembourse + montantDebitInt, totalDu);
    const pretRembourse = nouveauMontantRembourse >= totalDu;

    const { error: updateError } = await admin
      .from('prets_bancaires')
      .update({
        montant_rembourse: pretRembourse ? totalDu : nouveauMontantRembourse,
        ...(pretRembourse && {
          statut: 'rembourse',
          rembourse_at: new Date().toISOString(),
        }),
      })
      .eq('id', pret.id);

    if (updateError) {
      await admin.rpc('crediter_compte_safe', { p_compte_id: compteCompagnie.id, p_montant: montantDebitInt });
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du prêt' }, { status: 500 });
    }

    // Enregistrer la transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'debit',
      montant: montantDebitInt,
      libelle: `Remboursement prêt bancaire — ${montantDebitInt.toLocaleString('fr-FR')} F$`,
    });

    const nouveauReste = Math.max(0, totalDu - nouveauMontantRembourse);

    return NextResponse.json({
      ok: true,
      message: pretRembourse 
        ? `🎉 Prêt intégralement remboursé ! Félicitations !`
        : `✅ Remboursement de ${montantDebitInt.toLocaleString('fr-FR')} F$ effectué. Reste à payer: ${nouveauReste.toLocaleString('fr-FR')} F$`,
      montantRembourse: montantDebitInt,
      resteARembourser: nouveauReste,
      pretRembourse,
    });
  } catch (e) {
    console.error('PATCH pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET - Récupérer le prêt actif de la compagnie
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id || await isCoPdg(user.id, id, admin);

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Accès réservé au PDG' }, { status: 403 });
    }

    // Récupérer le prêt actif
    const { data: pret } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Récupérer l'historique des prêts remboursés
    const { data: historique } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'rembourse')
      .order('rembourse_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      pretActif: serialiserPretClient(pret ? { ...pret } as Record<string, unknown> : null),
      historique: (historique ?? []).map((h) => serialiserPretClient({ ...h } as Record<string, unknown>)),
      optionsPrets: OPTIONS_PRETS,
      tauxPrelevement: TAUX_PRELEVEMENT_PRET,
    });
  } catch (e) {
    console.error('GET pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Demander un nouveau prêt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { montant } = body;

    // Vérifier que le montant est valide
    const optionPret = OPTIONS_PRETS.find(p => p.montant === montant);
    if (!optionPret) {
      return NextResponse.json({ 
        error: `Montant invalide. Options disponibles: ${OPTIONS_PRETS.map(p => p.montant.toLocaleString('fr-FR')).join(', ')} F$` 
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id || await isCoPdg(user.id, id, admin);

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Seul le PDG peut demander un prêt' }, { status: 403 });
    }

    // Vérifier qu'il n'y a pas déjà un prêt actif
    const { data: pretExistant } = await admin
      .from('prets_bancaires')
      .select('id, montant_emprunte, montant_total_du, montant_rembourse')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pretExistant) {
      const resteARembourser = Math.max(
        0,
        montantF$(pretExistant.montant_total_du) - montantF$(pretExistant.montant_rembourse)
      );
      if (resteARembourser <= 0) {
        await admin
          .from('prets_bancaires')
          .update({
            montant_rembourse: montantF$(pretExistant.montant_total_du),
            statut: 'rembourse',
            rembourse_at: new Date().toISOString(),
          })
          .eq('id', pretExistant.id);
      } else {
      return NextResponse.json({ 
        error: `Un prêt est déjà en cours. Il reste ${resteARembourser.toLocaleString('fr-FR')} F$ à rembourser.` 
      }, { status: 400 });
      }
    }

    // Calculer le montant total à rembourser
    const montantTotalDu = calculerMontantTotalPret(optionPret.montant, optionPret.tauxInteret);

    const echeanceJours = getEcheanceJours(optionPret.montant);
    const echeanceAt = new Date(Date.now() + echeanceJours * 86_400_000).toISOString();

    const { data: nouveauPret, error: pretError } = await admin
      .from('prets_bancaires')
      .insert({
        compagnie_id: id,
        demandeur_id: user.id,
        montant_emprunte: optionPret.montant,
        taux_interet: optionPret.tauxInteret,
        montant_total_du: montantTotalDu,
        montant_rembourse: 0,
        statut: 'actif',
        echeance_at: echeanceAt,
      })
      .select()
      .single();

    if (pretError) {
      console.error('Erreur création prêt:', pretError);
      return NextResponse.json({ error: 'Erreur lors de la création du prêt' }, { status: 500 });
    }

    // Créditer le compte de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', id)
      .eq('type', 'entreprise')
      .single();

    if (!compteCompagnie) {
      // Rollback: supprimer le prêt créé
      await admin.from('prets_bancaires').delete().eq('id', nouveauPret.id);
      return NextResponse.json({ error: 'Compte de la compagnie introuvable' }, { status: 404 });
    }

    // Créditer le montant emprunté
    const { data: creditOk, error: creditError } = await admin
      .rpc('crediter_compte_safe', { p_compte_id: compteCompagnie.id, p_montant: optionPret.montant });

    if (creditError || !creditOk) {
      await admin.from('prets_bancaires').delete().eq('id', nouveauPret.id);
      return NextResponse.json({ error: 'Erreur lors du crédit' }, { status: 500 });
    }

    // Enregistrer la transaction
    const libellePret = `Prêt bancaire - ${optionPret.montant.toLocaleString('fr-FR')} F$ à ${optionPret.tauxInteret}%`;
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'credit',
      montant: optionPret.montant,
      libelle: libellePret,
    });

    const interets = montantTotalDu - optionPret.montant;

    return NextResponse.json({
      ok: true,
      message: `Pret de ${optionPret.montant.toLocaleString('fr-FR')} F$ accorde ! Taux: ${optionPret.tauxInteret}%. A rembourser: ${montantTotalDu.toLocaleString('fr-FR')} F$ (dont ${interets.toLocaleString('fr-FR')} F$ d'interets). Echeance: ${echeanceJours} jours. ${TAUX_PRELEVEMENT_PRET}% des revenus de vols seront preleves automatiquement.`,
      pret: nouveauPret,
    });
  } catch (e) {
    console.error('POST pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
