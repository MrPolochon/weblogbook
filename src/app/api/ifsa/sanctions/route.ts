import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const TYPES_SANCTIONS_VALIDES = [
  'avertissement',
  'suspension_temporaire',
  'suspension_licence',
  'retrait_licence',
  'amende',
] as const;
type TypeSanction = typeof TYPES_SANCTIONS_VALIDES[number];

const TYPES_BLOCAGE: TypeSanction[] = ['suspension_temporaire', 'suspension_licence', 'retrait_licence'];

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
    const cibleType = searchParams.get('cible_type'); // 'pilote' | 'compagnie'
    const typeSanction = searchParams.get('type_sanction');
    const search = searchParams.get('q')?.trim();
    const limitRaw = searchParams.get('limit');
    const limit = Math.max(1, Math.min(parseInt(limitRaw || '100', 10) || 100, 500));

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
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type !== 'toutes') {
      // Sanctions concernant l'utilisateur
      query = query.eq('cible_pilote_id', user.id);
    }

    if (actifOnly) {
      query = query.eq('actif', true);
    }

    if (cibleType === 'pilote' || cibleType === 'compagnie') {
      query = query.eq('cible_type', cibleType);
    }

    if (typeSanction && (TYPES_SANCTIONS_VALIDES as readonly string[]).includes(typeSanction)) {
      query = query.eq('type_sanction', typeSanction);
    }

    if (search) {
      const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`motif.ilike.%${escaped}%,details.ilike.%${escaped}%`);
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
    } = body as {
      type_sanction?: TypeSanction;
      cible_type?: 'pilote' | 'compagnie';
      cible_pilote_id?: string | null;
      cible_compagnie_id?: string | null;
      motif?: string;
      details?: string | null;
      duree_jours?: number | null;
      montant_amende?: number | null;
      vban_destination?: string | null;
    };

    if (!type_sanction || !cible_type || !motif) {
      return NextResponse.json({ error: 'Type, cible et motif requis' }, { status: 400 });
    }

    if (!(TYPES_SANCTIONS_VALIDES as readonly string[]).includes(type_sanction)) {
      return NextResponse.json({ error: `Type de sanction invalide. Valeurs autorisées: ${TYPES_SANCTIONS_VALIDES.join(', ')}` }, { status: 400 });
    }

    if (cible_type !== 'pilote' && cible_type !== 'compagnie') {
      return NextResponse.json({ error: 'cible_type doit être "pilote" ou "compagnie"' }, { status: 400 });
    }

    if (cible_type === 'pilote' && !cible_pilote_id) {
      return NextResponse.json({ error: 'Pilote cible requis' }, { status: 400 });
    }

    if (cible_type === 'compagnie' && !cible_compagnie_id) {
      return NextResponse.json({ error: 'Compagnie cible requise' }, { status: 400 });
    }

    const motifClean = String(motif).trim();
    if (motifClean.length < 4) {
      return NextResponse.json({ error: 'Le motif doit contenir au moins 4 caractères' }, { status: 400 });
    }

    if (type_sanction === 'amende') {
      if (!vban_destination) {
        return NextResponse.json({ error: 'VBAN du compte destinataire requis pour les amendes' }, { status: 400 });
      }
      if (!montant_amende || montant_amende <= 0) {
        return NextResponse.json({ error: 'Montant d\'amende invalide (doit être > 0)' }, { status: 400 });
      }
    }

    if (type_sanction === 'suspension_temporaire') {
      if (!duree_jours || duree_jours <= 0) {
        return NextResponse.json({ error: 'Durée invalide (doit être > 0)' }, { status: 400 });
      }
      if (duree_jours > 365) {
        return NextResponse.json({ error: 'Durée maximale de 365 jours' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    // Si c'est une amende, vérifier que le VBAN existe
    let compteDestinationId: string | null = null;
    if (type_sanction === 'amende' && vban_destination) {
      const vbanCleaned = vban_destination.trim().replace(/\s+/g, '').toUpperCase();

      const { data: compteDestination, error: compteError } = await admin.from('felitz_comptes')
        .select('id, vban, proprietaire_id, compagnie_id, type')
        .eq('vban', vbanCleaned)
        .single();

      if (compteError || !compteDestination) {
        return NextResponse.json(
          { error: `VBAN "${vbanCleaned}" introuvable. Vérifiez le code et réessayez.` },
          { status: 400 }
        );
      }
      compteDestinationId = compteDestination.id;
    }

    // Calculer la date d'expiration si c'est une suspension temporaire
    let expireAt: string | null = null;
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
        motif: motifClean,
        details: details ? String(details).trim() : null,
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
    if (cible_pilote_id && (TYPES_BLOCAGE as readonly string[]).includes(type_sanction)) {
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

      let contenuMessage = `**Sanction IFSA**\n\nType : ${typesLabels[type_sanction]}\n\nMotif : ${motifClean}\n\n`;
      if (details) contenuMessage += `Détails : ${details}\n\n`;
      if (duree_jours) contenuMessage += `Durée : ${duree_jours} jours\n\n`;
      if (montant_amende) contenuMessage += `💰 **Montant à payer : ${montant_amende} F$**\n\nVeuillez procéder au paiement de cette amende dans les plus brefs délais. Des relances quotidiennes seront envoyées jusqu'au paiement.\n\n`;

      if ((TYPES_BLOCAGE as readonly string[]).includes(type_sanction)) {
        contenuMessage += `🚫 **Vous êtes interdit de vol** jusqu'à la levée de cette sanction.\n\n`;
      }

      contenuMessage += `Agent IFSA : ${ifsaProfile?.identifiant}\n\nPour toute contestation, veuillez contacter l'IFSA.`;

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
    const { id, motif_levee } = body as { id?: string; motif_levee?: string | null };

    if (!id) {
      return NextResponse.json({ error: 'ID sanction requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que la sanction existe et est active
    const { data: existing } = await admin.from('ifsa_sanctions')
      .select('id, actif, type_sanction, motif, cible_pilote_id, cible_compagnie_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Sanction introuvable' }, { status: 404 });
    }
    if (!existing.actif) {
      return NextResponse.json({ error: 'Cette sanction est déjà levée' }, { status: 400 });
    }

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

    if (ciblePilote?.id && (TYPES_BLOCAGE as readonly string[]).includes(data.type_sanction)) {
      const { data: autresSanctions } = await admin.from('ifsa_sanctions')
        .select('id')
        .eq('cible_pilote_id', ciblePilote.id)
        .eq('actif', true)
        .neq('id', id)
        .in('type_sanction', TYPES_BLOCAGE)
        .limit(1);

      if (!autresSanctions || autresSanctions.length === 0) {
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
    const destinataireMessage = ciblePilote?.id
      || (existing.cible_compagnie_id ? await getCompagniePdg(admin, existing.cible_compagnie_id) : null);
    if (destinataireMessage) {
      const estSanctionBlocage = (TYPES_BLOCAGE as readonly string[]).includes(data.type_sanction);
      const motifBloc = motif_levee ? `\n\nMotif de la levée : ${motif_levee}` : '';
      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: destinataireMessage,
        titre: '✅ Sanction levée - IFSA',
        contenu: `Bonne nouvelle !\n\nVotre sanction pour "${data.motif}" a été levée par l'IFSA.${motifBloc}\n\n${estSanctionBlocage ? '✈️ Vous êtes de nouveau autorisé à voler.\n\n' : ''}Vous pouvez reprendre vos activités normalement.`,
        type_message: 'normal'
      });
    }

    return NextResponse.json({ ok: true, message: 'Sanction levée', sanction: data });
  } catch (e) {
    console.error('Sanctions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function getCompagniePdg(admin: ReturnType<typeof createAdminClient>, compagnieId: string): Promise<string | null> {
  const { data } = await admin.from('compagnies')
    .select('pdg_id')
    .eq('id', compagnieId)
    .single();
  return data?.pdg_id || null;
}
