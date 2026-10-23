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

    const { data, error } = await admin.rpc('payer_amende_ifsa_atomique', {
      p_sanction_id: sanction_id,
      p_acteur_id: user.id,
      p_compte_id: compte_id || null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
    }
    return NextResponse.json({ ...data, message: data?.deja_payee
      ? 'Cette amende est déjà payée.'
      : 'Amende de ' + data?.montant + ' F$ payée avec succès' });
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
