import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Récupérer les amendes en attente de paiement
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const compagnieId = searchParams.get('compagnie_id');

    // Récupérer les amendes non payées
    let query = admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant),
        cible_compagnie:compagnies!cible_compagnie_id(id, nom, pdg_id),
        emis_par:profiles!emis_par_id(id, identifiant)
      `)
      .eq('type_sanction', 'amende')
      .eq('actif', true)
      .eq('amende_payee', false)
      .order('created_at', { ascending: false });

    if (compagnieId) {
      const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', compagnieId).single();
      if (!comp || comp.pdg_id !== user.id) {
        const { data: prof } = await admin.from('profiles').select('role, ifsa').eq('id', user.id).single();
        if (prof?.role !== 'admin' && !prof?.ifsa) {
          return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
        }
      }
      query = query.eq('cible_compagnie_id', compagnieId);
    } else {
      // Amendes personnelles du pilote
      query = query.eq('cible_pilote_id', user.id);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('Amendes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Payer une amende
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { sanction_id, compte_id } = body;

    if (!sanction_id) {
      return NextResponse.json({ error: 'ID sanction requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer la sanction
    const { data: sanction, error: sanctionError } = await admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_compagnie:compagnies!cible_compagnie_id(id, nom, pdg_id)
      `)
      .eq('id', sanction_id)
      .eq('type_sanction', 'amende')
      .eq('actif', true)
      .eq('amende_payee', false)
      .single();

    if (sanctionError || !sanction) {
      return NextResponse.json({ error: 'Amende introuvable ou déjà payée' }, { status: 404 });
    }

    // Vérifier que l'utilisateur peut payer cette amende
    const cibleCompagnie = sanction.cible_compagnie ? 
      (Array.isArray(sanction.cible_compagnie) ? sanction.cible_compagnie[0] : sanction.cible_compagnie) : null;
    
    const canPay = 
      sanction.cible_pilote_id === user.id || // Amende personnelle
      (cibleCompagnie && cibleCompagnie.pdg_id === user.id); // Amende compagnie et user est PDG

    if (!canPay) {
      return NextResponse.json({ error: 'Non autorisé à payer cette amende' }, { status: 403 });
    }

    const montant = sanction.montant_amende;
    if (!montant || montant <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }

    // Trouver le compte à débiter
    let compteADebiter = compte_id;
    
    if (compteADebiter) {
      // Valider que le compte appartient bien à l'utilisateur ou à la compagnie ciblée
      const { data: compteValid } = await admin.from('felitz_comptes')
        .select('id, proprietaire_id, compagnie_id')
        .eq('id', compteADebiter)
        .single();
      if (!compteValid) {
        return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
      }
      const ownsCompte = compteValid.proprietaire_id === user.id
        || (cibleCompagnie && compteValid.compagnie_id === cibleCompagnie.id);
      if (!ownsCompte) {
        return NextResponse.json({ error: 'Ce compte ne vous appartient pas' }, { status: 403 });
      }
    } else {
      if (cibleCompagnie) {
        const { data: compteCompagnie } = await admin.from('felitz_comptes')
          .select('id')
          .eq('compagnie_id', cibleCompagnie.id)
          .eq('type', 'entreprise')
          .single();
        if (compteCompagnie) compteADebiter = compteCompagnie.id;
      } else {
        const { data: comptePerso } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', user.id)
          .eq('type', 'personnel')
          .single();
        if (comptePerso) compteADebiter = comptePerso.id;
      }
    }

    if (!compteADebiter) {
      return NextResponse.json({ error: 'Aucun compte trouvé pour le paiement' }, { status: 400 });
    }

    // Débit atomique
    const { data: debitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compteADebiter, p_montant: montant });
    if (!debitOk) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Créer la transaction de débit
    await admin.from('felitz_transactions').insert({
      compte_id: compteADebiter,
      type: 'debit',
      montant: montant,
      libelle: `Paiement amende IFSA - ${sanction.motif}`
    });

    // Créditer le compte destinataire (IFSA/étatique)
    if (sanction.compte_destination_id) {
      const { data: compteDestination } = await admin.from('felitz_comptes')
        .select('id, solde, vban')
        .eq('id', sanction.compte_destination_id)
        .single();
      
      if (compteDestination) {
        await admin.rpc('crediter_compte_safe', { p_compte_id: compteDestination.id, p_montant: montant });

        // Créer la transaction de crédit
        await admin.from('felitz_transactions').insert({
          compte_id: compteDestination.id,
          type: 'credit',
          montant: montant,
          libelle: `Amende IFSA reçue - ${sanction.motif}`
        });
      }
    }

    // Enregistrer le paiement
    await admin.from('ifsa_paiements_amendes').insert({
      sanction_id: sanction_id,
      montant: montant,
      paye_par_id: user.id,
      compte_debit_id: compteADebiter,
      compte_credit_id: sanction.compte_destination_id
    });

    // Marquer l'amende comme payée
    await admin.from('ifsa_sanctions')
      .update({
        amende_payee: true,
        amende_payee_at: new Date().toISOString(),
        amende_payee_par_id: user.id,
        actif: false,
        cleared_at: new Date().toISOString()
      })
      .eq('id', sanction_id);

    // Notifier l'agent IFSA qui a émis la sanction
    await admin.from('messages').insert({
      expediteur_id: user.id,
      destinataire_id: sanction.emis_par_id,
      titre: `✅ Amende payée - ${sanction.motif}`,
      contenu: `L'amende de ${montant} F$ pour "${sanction.motif}" a été payée.`,
      type_message: 'normal'
    });

    return NextResponse.json({ 
      ok: true, 
      message: `Amende de ${montant} F$ payée avec succès` 
    });
  } catch (e) {
    console.error('Amendes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Envoyer des relances pour les amendes impayées (appelé par cron)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Vérifier si c'est un appel système (header spécial) ou un admin
    const authHeader = req.headers.get('x-cron-secret');
    const isCronJob = authHeader === process.env.CRON_SECRET;
    
    if (!isCronJob) {
      if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      
      // Vérifier si admin
      const { data: profile } = await supabase.from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
      }
    }

    const admin = createAdminClient();

    // Récupérer les amendes non payées qui n'ont pas eu de relance depuis 24h
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);

    const { data: amendesARelancer, error } = await admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant),
        cible_compagnie:compagnies!cible_compagnie_id(id, nom, pdg_id)
      `)
      .eq('type_sanction', 'amende')
      .eq('actif', true)
      .eq('amende_payee', false)
      .or(`derniere_relance_at.is.null,derniere_relance_at.lt.${hier.toISOString()}`);

    if (error) {
      console.error('Erreur récupération amendes:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let relancesEnvoyees = 0;

    for (const amende of amendesARelancer || []) {
      const cibleCompagnie = amende.cible_compagnie ? 
        (Array.isArray(amende.cible_compagnie) ? amende.cible_compagnie[0] : amende.cible_compagnie) : null;
      const ciblePilote = amende.cible_pilote ? 
        (Array.isArray(amende.cible_pilote) ? amende.cible_pilote[0] : amende.cible_pilote) : null;

      // Déterminer le destinataire
      let destinataireId: string | null = null;
      let destinataireNom = '';

      if (cibleCompagnie) {
        destinataireId = cibleCompagnie.pdg_id;
        destinataireNom = cibleCompagnie.nom;
      } else if (ciblePilote) {
        destinataireId = ciblePilote.id;
        destinataireNom = ciblePilote.identifiant;
      }

      if (!destinataireId) continue;

      const nbRelances = (amende.nb_relances || 0) + 1;
      const urgence = nbRelances >= 3 ? '🔴 URGENT - ' : nbRelances >= 2 ? '⚠️ ' : '';

      // Envoyer le message de relance avec métadonnées pour le paiement direct
      await admin.from('messages').insert({
        destinataire_id: destinataireId,
        titre: `${urgence}Relance amende IFSA - ${amende.montant_amende} F$`,
        contenu: `**Relance n°${nbRelances}**\n\nVous avez une amende IFSA impayée de **${amende.montant_amende} F$**.\n\nMotif : ${amende.motif}\n\n${nbRelances >= 3 ? '⚠️ **Attention** : Le non-paiement prolongé peut entraîner des sanctions supplémentaires (suspension de licence).\n\n' : ''}Veuillez procéder au paiement dans les plus brefs délais.\n\nCordialement,\nIFSA - International Flight Safety Authority`,
        type_message: 'relance_amende',
        metadata: {
          sanction_id: amende.id,
          montant_amende: amende.montant_amende,
          amende_payee: false
        }
      });

      // Mettre à jour la sanction
      await admin.from('ifsa_sanctions')
        .update({
          derniere_relance_at: new Date().toISOString(),
          nb_relances: nbRelances
        })
        .eq('id', amende.id);

      relancesEnvoyees++;
    }

    return NextResponse.json({ 
      ok: true, 
      message: `${relancesEnvoyees} relance(s) envoyée(s)`,
      count: relancesEnvoyees
    });
  } catch (e) {
    console.error('Amendes PATCH (relances):', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
