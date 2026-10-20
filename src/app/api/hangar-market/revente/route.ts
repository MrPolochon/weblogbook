export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const POURCENTAGE_FIXE = 50;
// GET - Récupérer les demandes de revente (mes demandes ou toutes pour admin)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const { searchParams } = new URL(req.url);
    const statut = searchParams.get('statut');

    let query = admin.from('hangar_market_reventes')
      .select(`
        *,
        demandeur:demandeur_id(id, identifiant),
        compagnie:compagnie_id(id, nom),
        admin_profile:admin_id(id, identifiant)
      `)
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('demandeur_id', user.id);
    }
    if (statut) {
      query = query.eq('statut', statut);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('Revente GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Revente directe (50%) ou demande de revente à un % supérieur
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const admin = createAdminClient();

    // ============================
    // REVENTE RAPIDE (50%, instantanée, 2×/semaine max)
    // ============================
    if (action === 'revente_directe') {
      const { inventaire_avion_id, compagnie_avion_id } = body;

      if (Boolean(inventaire_avion_id) === Boolean(compagnie_avion_id)) {
        return NextResponse.json({ error: 'Sélectionnez un seul avion' }, { status: 400 });
      }

      const result = await executerRevente(admin, user.id, { inventaire_avion_id, compagnie_avion_id });
      if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      return NextResponse.json({ ok: true, message: result.message, montant: result.montant });
    }

    // ============================
    // DEMANDE DE REVENTE (50% fixe, approbation admin requise)
    // ============================
    if (action === 'demande_revente') {
      const { inventaire_avion_id, compagnie_avion_id } = body;

      if (Boolean(inventaire_avion_id) === Boolean(compagnie_avion_id)) {
        return NextResponse.json({ error: 'Sélectionnez un seul avion' }, { status: 400 });
      }

      // Récupérer l'avion et vérifier la propriété
      const avionInfo = await getAvionInfo(admin, user.id, inventaire_avion_id, compagnie_avion_id);
      if (!avionInfo.success) {
        return NextResponse.json({ error: avionInfo.error }, { status: avionInfo.status || 400 });
      }

      // Vérifier qu'il n'y a pas déjà une demande en attente
      const { data: existing } = await admin.from('hangar_market_reventes')
        .select('id')
        .eq('demandeur_id', user.id)
        .eq('statut', 'en_attente')
        .or(
          inventaire_avion_id
            ? `inventaire_avion_id.eq.${inventaire_avion_id}`
            : `compagnie_avion_id.eq.${compagnie_avion_id}`
        )
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'Une demande est déjà en attente pour cet avion' }, { status: 400 });
      }

      const montant = Math.round(avionInfo.prixInitial! * POURCENTAGE_FIXE / 100);

      // Créer la demande
      const { error: insertErr } = await admin.from('hangar_market_reventes').insert({
        demandeur_id: user.id,
        inventaire_avion_id: inventaire_avion_id || null,
        compagnie_avion_id: compagnie_avion_id || null,
        compagnie_id: avionInfo.compagnieId || null,
        type_avion_id: avionInfo.typeAvionId,
        prix_initial: avionInfo.prixInitial,
        pourcentage_demande: POURCENTAGE_FIXE,
        montant_revente: montant,
        raison: null,
        statut: 'en_attente',
      });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        message: `Demande de revente à 50% envoyée (${montant.toLocaleString('fr-FR')} F$). Un administrateur va traiter votre demande.`,
      });
    }

    // ============================
    // APPROUVER UNE DEMANDE (admin)
    // ============================
    if (action === 'approuver_revente') {
      const { demande_id } = body;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
      }

      const { data: demande } = await admin.from('hangar_market_reventes')
        .select('*')
        .eq('id', demande_id)
        .eq('statut', 'en_attente')
        .single();

      if (!demande) {
        return NextResponse.json({ error: 'Demande introuvable ou déjà traitée' }, { status: 404 });
      }

      const result = await executerRevente(admin, user.id, {
        demandeId: demande_id, commentaire: typeof body.commentaire === 'string' ? body.commentaire : null,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      // Notifier le demandeur de l'approbation
      await admin.from('messages').insert({
        destinataire_id: demande.demandeur_id,
        titre: `✅ Revente approuvée — ${result.montant?.toLocaleString('fr-FR')} F$`,
        contenu: `Votre demande de revente à ${demande.pourcentage_demande}% a été approuvée.\n\n${result.message}${body.commentaire ? `\n\nCommentaire admin : ${body.commentaire}` : ''}`,
        type_message: 'normal',
      });

      return NextResponse.json({ ok: true, message: `Revente approuvée et exécutée. ${result.montant?.toLocaleString('fr-FR')} F$ crédités.` });
    }

    // ============================
    // REFUSER UNE DEMANDE (admin)
    // ============================
    if (action === 'refuser_revente') {
      const { demande_id, commentaire } = body;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
      }

      const { data: demande } = await admin.from('hangar_market_reventes')
        .select('*')
        .eq('id', demande_id)
        .eq('statut', 'en_attente')
        .single();

      if (!demande) {
        return NextResponse.json({ error: 'Demande introuvable ou déjà traitée' }, { status: 404 });
      }

      const { data: refused, error: refusalError } = await admin.from('hangar_market_reventes')
        .update({
          statut: 'refusee',
          admin_id: user.id,
          admin_commentaire: commentaire || null,
          traite_at: new Date().toISOString(),
        })
        .eq('id', demande_id).eq('statut', 'en_attente').select('id').maybeSingle();
      if (refusalError || !refused) return NextResponse.json({ error: 'Cette demande a déjà été traitée. Actualisez la liste.' }, { status: 409 });

      // Notifier le demandeur
      await admin.from('messages').insert({
        destinataire_id: demande.demandeur_id,
        titre: '❌ Demande de revente refusée',
        contenu: `Votre demande de revente à ${demande.pourcentage_demande}% a été refusée.${commentaire ? `\n\nMotif : ${commentaire}` : ''}`,
        type_message: 'normal',
      });

      return NextResponse.json({ ok: true, message: 'Demande refusée' });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (e) {
    console.error('Revente POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ============================================================
// Helpers
// ============================================================

type AdminClient = ReturnType<typeof createAdminClient>;

async function getAvionInfo(
  admin: AdminClient,
  userId: string,
  inventaireAvionId?: string,
  compagnieAvionId?: string
): Promise<{
  success: boolean;
  error?: string;
  status?: number;
  typeAvionId?: string;
  typeAvionNom?: string;
  prixInitial?: number;
  compagnieId?: string | null;
  compteId?: string;
}> {
  if (inventaireAvionId) {
    const { data: avion } = await admin.from('inventaire_avions')
      .select('id, type_avion_id, proprietaire_id, prix_achat, types_avion:type_avion_id(id, nom, prix)')
      .eq('id', inventaireAvionId)
      .single();

    if (!avion) return { success: false, error: 'Avion introuvable', status: 404 };
    if (avion.proprietaire_id !== userId) return { success: false, error: 'Cet avion ne vous appartient pas', status: 403 };

    // Bloquer si l'avion est déjà en annonce active sur le Hangar Market
    const { data: annonceActive } = await admin.from('hangar_market')
      .select('id')
      .eq('inventaire_avion_id', inventaireAvionId)
      .eq('statut', 'en_vente')
      .maybeSingle();
    if (annonceActive) {
      return { success: false, error: 'Cet avion est déjà en vente sur le Hangar Market. Retirez l\'annonce avant de le revendre directement.', status: 400 };
    }

    // Bloquer si l'avion est en vol actif
    const { count: enVol } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', inventaireAvionId)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    if ((enVol ?? 0) > 0) {
      return { success: false, error: 'Impossible de revendre un avion actuellement en vol', status: 400 };
    }

    const rawType = avion.types_avion as unknown;
    const typesAvion = (Array.isArray(rawType) ? rawType[0] : rawType) as { id: string; nom: string; prix: number } | null;
    if (!typesAvion || !typesAvion.prix) return { success: false, error: 'Type d\'avion introuvable', status: 404 };

    const prixCatalogue = typesAvion.prix;
    const prixAchatReel = (avion.prix_achat && avion.prix_achat > 0) ? avion.prix_achat : prixCatalogue;
    const prixPourRevente = Math.min(prixCatalogue, prixAchatReel);

    const { data: compte } = await admin.from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', userId)
      .eq('type', 'personnel')
      .single();

    return {
      success: true,
      typeAvionId: typesAvion.id,
      typeAvionNom: typesAvion.nom,
      prixInitial: prixPourRevente,
      compagnieId: null,
      compteId: compte?.id,
    };
  }

  if (compagnieAvionId) {
    const { data: avion } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, type_avion_id, detruit, statut, prix_achat, types_avion:type_avion_id(id, nom, prix)')
      .eq('id', compagnieAvionId)
      .single();

    if (!avion) return { success: false, error: 'Avion introuvable', status: 404 };

    const { data: compagnie } = await admin.from('compagnies')
      .select('id, pdg_id')
      .eq('id', avion.compagnie_id)
      .single();

    if (!compagnie || compagnie.pdg_id !== userId) {
      return { success: false, error: 'Seul le PDG peut vendre un avion de la flotte', status: 403 };
    }

    if (avion.statut === 'in_flight') {
      return { success: false, error: 'Impossible de vendre un avion en vol', status: 400 };
    }

    // Bloquer si l'avion de flotte est déjà en annonce active sur le Hangar Market
    const { data: annonceActiveFlotte } = await admin.from('hangar_market')
      .select('id')
      .eq('compagnie_avion_id', compagnieAvionId)
      .eq('statut', 'en_vente')
      .maybeSingle();
    if (annonceActiveFlotte) {
      return { success: false, error: 'Cet avion est déjà en vente sur le Hangar Market. Retirez l\'annonce avant de le revendre directement.', status: 400 };
    }

    const rawType2 = avion.types_avion as unknown;
    const typesAvion = (Array.isArray(rawType2) ? rawType2[0] : rawType2) as { id: string; nom: string; prix: number } | null;
    if (!typesAvion || !typesAvion.prix) return { success: false, error: 'Type d\'avion introuvable', status: 404 };

    const prixCatalogue = typesAvion.prix;
    const prixAchatReel = (avion.prix_achat && avion.prix_achat > 0) ? avion.prix_achat : prixCatalogue;
    const prixPourRevente = Math.min(prixCatalogue, prixAchatReel);

    const { data: compte } = await admin.from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'entreprise')
      .single();

    return {
      success: true,
      typeAvionId: typesAvion.id,
      typeAvionNom: typesAvion.nom,
      prixInitial: prixPourRevente,
      compagnieId: avion.compagnie_id,
      compteId: compte?.id,
    };
  }

  return { success: false, error: 'Aucun avion sélectionné', status: 400 };
}

async function executerRevente(
  admin: AdminClient,
  actorId: string,
  options: { inventaire_avion_id?: string; compagnie_avion_id?: string; demandeId?: string; commentaire?: string | null }
): Promise<{ success: boolean; error?: string; status?: number; message?: string; montant?: number }> {
  const { data, error } = await admin.rpc('revendre_avion_atomic', {
    p_actor: actorId, p_inventaire: options.inventaire_avion_id || null,
    p_flotte: options.compagnie_avion_id || null, p_demande: options.demandeId || null,
    p_commentaire: options.commentaire || null,
  });
  if (error) {
    console.error('Revente atomique:', error);
    return { success: false, error: error.code === 'P0001' || error.code === '42501' ? error.message : 'Revente non effectuée. Réessayez.', status: error.code === '42501' ? 403 : error.message?.includes('Limite de 2') ? 429 : 409 };
  }
  if (!data?.ok) return { success: false, error: 'Revente non confirmée.', status: 500 };
  const message = data.type_nom + ' revendu pour ' + Number(data.montant).toLocaleString('fr-FR') + ' F$ (' + data.pourcentage + '%).' + (!options.demandeId ? ' Il vous reste ' + data.restantes + ' revente(s) rapide(s) cette semaine.' : '');
  return { success: true, montant: data.montant, message };
}
