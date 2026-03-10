import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const POURCENTAGE_BASE = 50;

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
    // REVENTE DIRECTE (50%)
    // ============================
    if (action === 'revente_directe') {
      const { inventaire_avion_id, compagnie_avion_id } = body;

      if (!inventaire_avion_id && !compagnie_avion_id) {
        return NextResponse.json({ error: 'Sélectionnez un avion' }, { status: 400 });
      }

      const result = await executerRevente(admin, user.id, {
        inventaire_avion_id,
        compagnie_avion_id,
        pourcentage: POURCENTAGE_BASE,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }

      return NextResponse.json({
        ok: true,
        message: result.message,
        montant: result.montant,
      });
    }

    // ============================
    // DEMANDE DE REVENTE (> 50%)
    // ============================
    if (action === 'demande_revente') {
      const { inventaire_avion_id, compagnie_avion_id, pourcentage, raison } = body;

      if (!inventaire_avion_id && !compagnie_avion_id) {
        return NextResponse.json({ error: 'Sélectionnez un avion' }, { status: 400 });
      }

      const pct = Number(pourcentage);
      if (!Number.isFinite(pct) || pct <= POURCENTAGE_BASE || pct > 100) {
        return NextResponse.json({ error: `Le pourcentage doit être entre ${POURCENTAGE_BASE + 1}% et 100%` }, { status: 400 });
      }

      if (!raison || typeof raison !== 'string' || raison.trim().length < 10) {
        return NextResponse.json({ error: 'La raison doit contenir au moins 10 caractères' }, { status: 400 });
      }
      if (raison.length > 1000) {
        return NextResponse.json({ error: 'La raison ne doit pas dépasser 1000 caractères' }, { status: 400 });
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

      const montant = Math.round(avionInfo.prixInitial! * pct / 100);

      // Créer la demande
      const { error: insertErr } = await admin.from('hangar_market_reventes').insert({
        demandeur_id: user.id,
        inventaire_avion_id: inventaire_avion_id || null,
        compagnie_avion_id: compagnie_avion_id || null,
        compagnie_id: avionInfo.compagnieId || null,
        type_avion_id: avionInfo.typeAvionId,
        prix_initial: avionInfo.prixInitial,
        pourcentage_demande: pct,
        montant_revente: montant,
        raison: raison.trim(),
        statut: 'en_attente',
      });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      // Notifier les admins
      const { data: admins } = await admin.from('profiles')
        .select('id')
        .eq('role', 'admin');

      for (const adm of admins || []) {
        await admin.from('messages').insert({
          destinataire_id: adm.id,
          expediteur_id: user.id,
          titre: `📋 Demande de revente à ${pct}%`,
          contenu: `Demande de revente d'un ${avionInfo.typeAvionNom} à ${pct}% du prix initial (${montant.toLocaleString('fr-FR')} F$ au lieu de ${Math.round(avionInfo.prixInitial! * POURCENTAGE_BASE / 100).toLocaleString('fr-FR')} F$).\n\nRaison : ${raison.trim()}`,
          type_message: 'normal',
        });
      }

      return NextResponse.json({
        ok: true,
        message: `Demande de revente à ${pct}% envoyée aux administrateurs.`,
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

      // Marquer comme approuvée
      await admin.from('hangar_market_reventes')
        .update({
          statut: 'approuvee',
          admin_id: user.id,
          admin_commentaire: body.commentaire || null,
          traite_at: new Date().toISOString(),
        })
        .eq('id', demande_id);

      // Exécuter la revente
      const result = await executerRevente(admin, demande.demandeur_id, {
        inventaire_avion_id: demande.inventaire_avion_id,
        compagnie_avion_id: demande.compagnie_avion_id,
        pourcentage: demande.pourcentage_demande,
        demandeId: demande_id,
      });

      if (!result.success) {
        // Si l'exécution échoue, notifier le demandeur
        await admin.from('messages').insert({
          destinataire_id: demande.demandeur_id,
          titre: '❌ Revente impossible',
          contenu: `Votre demande de revente a été approuvée mais n'a pas pu être exécutée : ${result.error}`,
          type_message: 'normal',
        });
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      // Notifier le demandeur
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

      await admin.from('hangar_market_reventes')
        .update({
          statut: 'refusee',
          admin_id: user.id,
          admin_commentaire: commentaire || null,
          traite_at: new Date().toISOString(),
        })
        .eq('id', demande_id);

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
      .select('id, type_avion_id, proprietaire_id, types_avion:type_avion_id(id, nom, prix)')
      .eq('id', inventaireAvionId)
      .single();

    if (!avion) return { success: false, error: 'Avion introuvable', status: 404 };
    if (avion.proprietaire_id !== userId) return { success: false, error: 'Cet avion ne vous appartient pas', status: 403 };

    const rawType = avion.types_avion as unknown;
    const typesAvion = (Array.isArray(rawType) ? rawType[0] : rawType) as { id: string; nom: string; prix: number } | null;
    if (!typesAvion || !typesAvion.prix) return { success: false, error: 'Type d\'avion introuvable', status: 404 };

    const { data: compte } = await admin.from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', userId)
      .eq('type', 'personnel')
      .single();

    return {
      success: true,
      typeAvionId: typesAvion.id,
      typeAvionNom: typesAvion.nom,
      prixInitial: typesAvion.prix,
      compagnieId: null,
      compteId: compte?.id,
    };
  }

  if (compagnieAvionId) {
    const { data: avion } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, type_avion_id, detruit, statut, types_avion:type_avion_id(id, nom, prix)')
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

    const rawType2 = avion.types_avion as unknown;
    const typesAvion = (Array.isArray(rawType2) ? rawType2[0] : rawType2) as { id: string; nom: string; prix: number } | null;
    if (!typesAvion || !typesAvion.prix) return { success: false, error: 'Type d\'avion introuvable', status: 404 };

    const { data: compte } = await admin.from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'entreprise')
      .single();

    return {
      success: true,
      typeAvionId: typesAvion.id,
      typeAvionNom: typesAvion.nom,
      prixInitial: typesAvion.prix,
      compagnieId: avion.compagnie_id,
      compteId: compte?.id,
    };
  }

  return { success: false, error: 'Aucun avion sélectionné', status: 400 };
}

async function executerRevente(
  admin: AdminClient,
  userId: string,
  options: {
    inventaire_avion_id?: string;
    compagnie_avion_id?: string;
    pourcentage: number;
    demandeId?: string;
  }
): Promise<{ success: boolean; error?: string; status?: number; message?: string; montant?: number }> {
  const avionInfo = await getAvionInfo(admin, userId, options.inventaire_avion_id, options.compagnie_avion_id);
  if (!avionInfo.success) {
    return { success: false, error: avionInfo.error, status: avionInfo.status };
  }

  if (!avionInfo.compteId) {
    return { success: false, error: 'Compte Felitz introuvable', status: 404 };
  }

  const montant = Math.round(avionInfo.prixInitial! * options.pourcentage / 100);

  // Créditer le compte
  const { data: creditOk } = await admin.rpc('crediter_compte_safe', { p_compte_id: avionInfo.compteId, p_montant: montant });
  if (!creditOk) {
    return { success: false, error: 'Erreur lors du crédit', status: 500 };
  }

  // Transaction
  const libelle = `Revente avion ${avionInfo.typeAvionNom} (${options.pourcentage}% du prix initial)`;
  await admin.from('felitz_transactions').insert({
    compte_id: avionInfo.compteId,
    type: 'credit',
    montant,
    libelle,
  });

  // Détruire l'avion
  if (options.inventaire_avion_id) {
    await admin.from('inventaire_avions').delete().eq('id', options.inventaire_avion_id);
  }
  if (options.compagnie_avion_id) {
    await admin.from('compagnie_avions').delete().eq('id', options.compagnie_avion_id);
  }

  // Mettre à jour la demande si applicable
  if (options.demandeId) {
    await admin.from('hangar_market_reventes')
      .update({ statut: 'executee', execute_at: new Date().toISOString() })
      .eq('id', options.demandeId);
  }

  const msg = `${avionInfo.typeAvionNom} revendu pour ${montant.toLocaleString('fr-FR')} F$ (${options.pourcentage}% de ${avionInfo.prixInitial!.toLocaleString('fr-FR')} F$).`;
  return { success: true, message: msg, montant };
}
