import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// Vérifier si l'utilisateur est IFSA
async function checkIfsa(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from('profiles')
    .select('role, ifsa')
    .eq('id', userId)
    .single();
  return profile?.ifsa || profile?.role === 'admin';
}

// GET - Récupérer les sanctions
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'mes' pour mes sanctions, 'toutes' pour IFSA
    const actifOnly = searchParams.get('actif') === 'true';

    const isIfsa = await checkIfsa(supabase, user.id);

    if (type === 'toutes' && !isIfsa) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    let query = admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant),
        cible_compagnie:compagnies!cible_compagnie_id(id, nom),
        emis_par:profiles!emis_par_id(id, identifiant),
        cleared_by:profiles!cleared_by_id(id, identifiant)
      `)
      .order('created_at', { ascending: false });

    if (type !== 'toutes') {
      // Sanctions concernant l'utilisateur
      query = query.eq('cible_pilote_id', user.id);
    }

    if (actifOnly) {
      query = query.eq('actif', true);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Sanctions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer une sanction
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      type_sanction, 
      cible_type,
      cible_pilote_id, 
      cible_compagnie_id, 
      motif, 
      details,
      duree_jours,
      montant_amende,
      vban_destination
    } = body;

    if (!type_sanction || !cible_type || !motif) {
      return NextResponse.json({ error: 'Type, cible et motif requis' }, { status: 400 });
    }

    if (cible_type === 'pilote' && !cible_pilote_id) {
      return NextResponse.json({ error: 'Pilote cible requis' }, { status: 400 });
    }

    if (cible_type === 'compagnie' && !cible_compagnie_id) {
      return NextResponse.json({ error: 'Compagnie cible requise' }, { status: 400 });
    }

    // Vérifier le VBAN pour les amendes
    if (type_sanction === 'amende' && !vban_destination) {
      return NextResponse.json({ error: 'VBAN du compte destinataire requis pour les amendes' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Si c'est une amende, vérifier que le VBAN existe
    let compteDestinationId: string | null = null;
    if (type_sanction === 'amende' && vban_destination) {
      // Nettoyer le VBAN (enlever espaces, retours à la ligne, caractères invisibles)
      const vbanCleaned = vban_destination.trim().replace(/\s+/g, '').toUpperCase();
      
      const { data: compteDestination, error: compteError } = await admin.from('felitz_comptes')
        .select('id, vban, proprietaire_id, compagnie_id, type')
        .eq('vban', vbanCleaned)
        .single();
      
      if (compteError || !compteDestination) {
        // On NE renvoie PAS de "VBANs similaires" : ça leakait des identifiants de
        // comptes Felitz à n'importe quel utilisateur ayant l'autorisation IFSA.
        // Si besoin de debug, l'admin peut chercher dans les logs serveur.
        return NextResponse.json(
          { error: `VBAN "${vbanCleaned}" introuvable. Vérifiez le code et réessayez.` },
          { status: 400 }
        );
      }
      compteDestinationId = compteDestination.id;
    }

    // Calculer la date d'expiration si c'est une suspension temporaire
    let expireAt = null;
    if (type_sanction === 'suspension_temporaire' && duree_jours) {
      const expire = new Date();
      expire.setDate(expire.getDate() + duree_jours);
      expireAt = expire.toISOString();
    }

    const { data, error } = await admin.from('ifsa_sanctions')
      .insert({
        type_sanction,
        cible_type,
        cible_pilote_id: cible_pilote_id || null,
        cible_compagnie_id: cible_compagnie_id || null,
        motif,
        details: details || null,
        duree_jours: duree_jours || null,
        montant_amende: montant_amende || null,
        vban_destination: vban_destination || null,
        compte_destination_id: compteDestinationId,
        emis_par_id: user.id,
        actif: true,
        expire_at: expireAt
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Récupérer les infos pour la notification
    const { data: ifsaProfile } = await admin.from('profiles')
      .select('identifiant')
      .eq('id', user.id)
      .single();

    // Appliquer le blocage de vol si nécessaire (en plus du trigger SQL)
    if (cible_pilote_id && ['suspension_temporaire', 'suspension_licence', 'retrait_licence'].includes(type_sanction)) {
      await admin.from('profiles')
        .update({
          sanction_blocage_vol: true,
          sanction_blocage_motif: type_sanction,
          sanction_blocage_jusqu_au: expireAt
        })
        .eq('id', cible_pilote_id);
    }

    // Notifier la cible
    const destinataireId = cible_pilote_id || (cible_compagnie_id ? await getCompagniePdg(admin, cible_compagnie_id) : null);
    
    if (destinataireId) {
      const typesLabels: Record<string, string> = {
        'avertissement': '⚠️ Avertissement',
        'suspension_temporaire': '🚫 Suspension temporaire',
        'suspension_licence': '🔴 Suspension de licence',
        'retrait_licence': '❌ Retrait de licence',
        'amende': '💰 Amende'
      };

      const typeMsg = type_sanction === 'amende' ? 'amende_ifsa' : 'normal';
      
      let contenuMessage = `**Sanction IFSA**\n\nType : ${typesLabels[type_sanction]}\n\nMotif : ${motif}\n\n`;
      if (details) contenuMessage += `Détails : ${details}\n\n`;
      if (duree_jours) contenuMessage += `Durée : ${duree_jours} jours\n\n`;
      if (montant_amende) contenuMessage += `💰 **Montant à payer : ${montant_amende} F$**\n\nVeuillez procéder au paiement de cette amende dans les plus brefs délais. Des relances quotidiennes seront envoyées jusqu'au paiement.\n\n`;
      
      // Ajout d'informations sur les conséquences
      if (['suspension_temporaire', 'suspension_licence', 'retrait_licence'].includes(type_sanction)) {
        contenuMessage += `🚫 **Vous êtes interdit de vol** jusqu'à la levée de cette sanction.\n\n`;
      }
      
      contenuMessage += `Agent IFSA : ${ifsaProfile?.identifiant}\n\nPour toute contestation, veuillez contacter l'IFSA.`;

      // Préparer les métadonnées pour les amendes
      const messageMetadata = type_sanction === 'amende' ? {
        sanction_id: data.id,
        montant_amende: montant_amende,
        amende_payee: false
      } : null;

      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: destinataireId,
        titre: `${typesLabels[type_sanction] || 'Sanction'} - IFSA`,
        contenu: contenuMessage,
        type_message: typeMsg,
        metadata: messageMetadata
      });
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Sanction émise',
      sanction: data 
    });
  } catch (e) {
    console.error('Sanctions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Lever une sanction (clear)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID sanction requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.from('ifsa_sanctions')
      .update({
        actif: false,
        cleared_by_id: user.id,
        cleared_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Si c'était une sanction de blocage, vérifier s'il faut lever le blocage
    const ciblePilote = data.cible_pilote ? (Array.isArray(data.cible_pilote) ? data.cible_pilote[0] : data.cible_pilote) : null;
    
    if (ciblePilote?.id && ['suspension_temporaire', 'suspension_licence', 'retrait_licence'].includes(data.type_sanction)) {
      // Vérifier s'il reste d'autres sanctions actives de blocage
      const { data: autresSanctions } = await admin.from('ifsa_sanctions')
        .select('id')
        .eq('cible_pilote_id', ciblePilote.id)
        .eq('actif', true)
        .neq('id', id)
        .in('type_sanction', ['suspension_temporaire', 'suspension_licence', 'retrait_licence'])
        .limit(1);
      
      if (!autresSanctions || autresSanctions.length === 0) {
        // Lever le blocage
        await admin.from('profiles')
          .update({
            sanction_blocage_vol: false,
            sanction_blocage_motif: null,
            sanction_blocage_jusqu_au: null
          })
          .eq('id', ciblePilote.id);
      }
    }

    // Notifier la cible que la sanction est levée
    if (ciblePilote?.id) {
      const estSanctionBlocage = ['suspension_temporaire', 'suspension_licence', 'retrait_licence'].includes(data.type_sanction);
      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: ciblePilote.id,
        titre: '✅ Sanction levée - IFSA',
        contenu: `Bonne nouvelle !\n\nVotre sanction pour "${data.motif}" a été levée par l'IFSA.\n\n${estSanctionBlocage ? '✈️ Vous êtes de nouveau autorisé à voler.\n\n' : ''}Vous pouvez reprendre vos activités normalement.`,
        type_message: 'normal'
      });
    }

    return NextResponse.json({ ok: true, message: 'Sanction levée', sanction: data });
  } catch (e) {
    console.error('Sanctions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// Helper pour récupérer le PDG d'une compagnie
async function getCompagniePdg(admin: ReturnType<typeof createAdminClient>, compagnieId: string): Promise<string | null> {
  const { data } = await admin.from('compagnies')
    .select('pdg_id')
    .eq('id', compagnieId)
    .single();
  return data?.pdg_id || null;
}
