import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Liste des annonces du Hangar Market
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mesAnnonces = searchParams.get('mes_annonces') === 'true';
    const compagnieId = searchParams.get('compagnie_id');

    const admin = createAdminClient();

    let query = admin.from('hangar_market')
      .select(`
        *,
        types_avion:type_avion_id(id, nom, code_oaci, constructeur, capacite_pax, capacite_cargo_kg),
        vendeur:vendeur_id(id, identifiant),
        compagnie_vendeur:compagnie_vendeur_id(id, nom),
        acheteur:acheteur_id(id, identifiant),
        compagnie_acheteur:compagnie_acheteur_id(id, nom)
      `)
      .order('created_at', { ascending: false });

    if (mesAnnonces) {
      // Mes annonces personnelles ou de mes compagnies
      const { data: mesCompagnies } = await admin.from('compagnies')
        .select('id')
        .eq('pdg_id', user.id);
      
      const compagnieIds = mesCompagnies?.map(c => c.id) || [];
      
      if (compagnieIds.length > 0) {
        query = query.or(`vendeur_id.eq.${user.id},compagnie_vendeur_id.in.(${compagnieIds.join(',')})`);
      } else {
        query = query.eq('vendeur_id', user.id);
      }
    } else if (compagnieId) {
      query = query.eq('compagnie_vendeur_id', compagnieId);
    } else {
      // Annonces en vente uniquement
      query = query.eq('statut', 'en_vente');
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Récupérer la config (taxe)
    const { data: config } = await admin.from('hangar_market_config')
      .select('taxe_vente_pourcent')
      .single();

    return NextResponse.json({ 
      annonces: data || [],
      taxe_pourcent: config?.taxe_vente_pourcent || 5
    });
  } catch (e) {
    console.error('Hangar Market GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer une annonce ou acheter un avion
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    const admin = createAdminClient();

    if (action === 'creer') {
      // Créer une annonce
      const { 
        inventaire_avion_id, 
        flotte_avion_id, 
        compagnie_vendeur_id,
        titre, 
        description, 
        prix, 
        etat 
      } = body;

      if (!titre || !prix || prix <= 0) {
        return NextResponse.json({ error: 'Titre et prix requis' }, { status: 400 });
      }

      if (!inventaire_avion_id && !flotte_avion_id) {
        return NextResponse.json({ error: 'Avion requis' }, { status: 400 });
      }

      let type_avion_id: string;
      let vendeur_id: string | null = null;
      let compagnie_id: string | null = null;

      if (inventaire_avion_id) {
        // Vente d'un avion personnel
        const { data: avion } = await admin.from('inventaire_avions')
          .select('id, type_avion_id, proprietaire_id')
          .eq('id', inventaire_avion_id)
          .single();

        if (!avion) {
          return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });
        }

        if (avion.proprietaire_id !== user.id) {
          return NextResponse.json({ error: 'Cet avion ne vous appartient pas' }, { status: 403 });
        }

        // Vérifier que l'avion n'est pas déjà en vente
        const { data: existingAnnonce } = await admin.from('hangar_market')
          .select('id')
          .eq('inventaire_avion_id', inventaire_avion_id)
          .eq('statut', 'en_vente')
          .single();

        if (existingAnnonce) {
          return NextResponse.json({ error: 'Cet avion est déjà en vente' }, { status: 400 });
        }

        // Vérifier que l'avion n'est pas en vol
        const { count: enVol } = await admin.from('plans_vol')
          .select('*', { count: 'exact', head: true })
          .eq('inventaire_avion_id', inventaire_avion_id)
          .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

        if ((enVol || 0) > 0) {
          return NextResponse.json({ error: 'Cet avion est en vol' }, { status: 400 });
        }

        type_avion_id = avion.type_avion_id;
        vendeur_id = user.id;

      } else if (flotte_avion_id && compagnie_vendeur_id) {
        // Vente d'un avion de flotte
        const { data: compagnie } = await admin.from('compagnies')
          .select('id, pdg_id')
          .eq('id', compagnie_vendeur_id)
          .single();

        if (!compagnie || compagnie.pdg_id !== user.id) {
          return NextResponse.json({ error: 'Seul le PDG peut vendre les avions de la compagnie' }, { status: 403 });
        }

        const { data: flotte } = await admin.from('compagnie_flotte')
          .select('id, type_avion_id, quantite')
          .eq('id', flotte_avion_id)
          .eq('compagnie_id', compagnie_vendeur_id)
          .single();

        if (!flotte || flotte.quantite < 1) {
          return NextResponse.json({ error: 'Avion introuvable dans la flotte' }, { status: 404 });
        }

        // Vérifier que l'avion n'est pas déjà en vente
        const { data: existingAnnonce } = await admin.from('hangar_market')
          .select('id')
          .eq('flotte_avion_id', flotte_avion_id)
          .eq('statut', 'en_vente')
          .single();

        if (existingAnnonce) {
          return NextResponse.json({ error: 'Cet avion est déjà en vente' }, { status: 400 });
        }

        type_avion_id = flotte.type_avion_id;
        compagnie_id = compagnie_vendeur_id;
      } else {
        return NextResponse.json({ error: 'Configuration invalide' }, { status: 400 });
      }

      // Créer l'annonce
      const { data: annonce, error } = await admin.from('hangar_market').insert({
        vendeur_id,
        compagnie_vendeur_id: compagnie_id,
        type_avion_id,
        inventaire_avion_id: inventaire_avion_id || null,
        flotte_avion_id: flotte_avion_id || null,
        titre,
        description: description || null,
        prix,
        etat: etat || 'bon',
        statut: 'en_vente'
      }).select('id').single();

      if (error) {
        console.error('Erreur création annonce:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, id: annonce.id });

    } else if (action === 'acheter') {
      // Acheter un avion
      const { annonce_id, pour_compagnie_id } = body;

      if (!annonce_id) {
        return NextResponse.json({ error: 'annonce_id requis' }, { status: 400 });
      }

      // Récupérer l'annonce
      const { data: annonce } = await admin.from('hangar_market')
        .select('*, types_avion:type_avion_id(nom)')
        .eq('id', annonce_id)
        .eq('statut', 'en_vente')
        .single();

      if (!annonce) {
        return NextResponse.json({ error: 'Annonce introuvable ou déjà vendue' }, { status: 404 });
      }

      // Vérifier que l'acheteur n'est pas le vendeur
      if (annonce.vendeur_id === user.id) {
        return NextResponse.json({ error: 'Vous ne pouvez pas acheter votre propre annonce' }, { status: 400 });
      }

      // Récupérer la taxe
      const { data: config } = await admin.from('hangar_market_config')
        .select('taxe_vente_pourcent')
        .single();
      const taxePourcent = config?.taxe_vente_pourcent || 5;
      const taxe = Math.round(annonce.prix * taxePourcent / 100);
      const prixTotal = annonce.prix + taxe;

      let compteAcheteurId: string;
      let acheteur_id: string | null = null;
      let compagnie_acheteur_id: string | null = null;

      if (pour_compagnie_id) {
        // Achat pour une compagnie
        const { data: compagnie } = await admin.from('compagnies')
          .select('id, pdg_id')
          .eq('id', pour_compagnie_id)
          .single();

        if (!compagnie || compagnie.pdg_id !== user.id) {
          return NextResponse.json({ error: 'Seul le PDG peut acheter pour la compagnie' }, { status: 403 });
        }

        const { data: compte } = await admin.from('felitz_comptes')
          .select('id, solde')
          .eq('compagnie_id', pour_compagnie_id)
          .eq('type', 'entreprise')
          .single();

        if (!compte || compte.solde < prixTotal) {
          return NextResponse.json({ error: `Solde insuffisant. Prix: ${prixTotal.toLocaleString('fr-FR')} F$ (dont ${taxe.toLocaleString('fr-FR')} F$ de taxe)` }, { status: 400 });
        }

        compteAcheteurId = compte.id;
        compagnie_acheteur_id = pour_compagnie_id;
      } else {
        // Achat personnel
        const { data: compte } = await admin.from('felitz_comptes')
          .select('id, solde')
          .eq('proprietaire_id', user.id)
          .eq('type', 'personnel')
          .single();

        if (!compte || compte.solde < prixTotal) {
          return NextResponse.json({ error: `Solde insuffisant. Prix: ${prixTotal.toLocaleString('fr-FR')} F$ (dont ${taxe.toLocaleString('fr-FR')} F$ de taxe)` }, { status: 400 });
        }

        compteAcheteurId = compte.id;
        acheteur_id = user.id;
      }

      // Compte vendeur
      let compteVendeurId: string;
      if (annonce.compagnie_vendeur_id) {
        const { data: compte } = await admin.from('felitz_comptes')
          .select('id')
          .eq('compagnie_id', annonce.compagnie_vendeur_id)
          .eq('type', 'entreprise')
          .single();
        compteVendeurId = compte?.id || '';
      } else {
        const { data: compte } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', annonce.vendeur_id)
          .eq('type', 'personnel')
          .single();
        compteVendeurId = compte?.id || '';
      }

      if (!compteVendeurId) {
        return NextResponse.json({ error: 'Compte vendeur introuvable' }, { status: 400 });
      }

      // Débiter l'acheteur
      await admin.rpc('debiter_compte', { p_compte_id: compteAcheteurId, p_montant: prixTotal });

      // Créditer le vendeur (prix sans taxe)
      await admin.rpc('crediter_compte', { p_compte_id: compteVendeurId, p_montant: annonce.prix });

      // Transactions
      const avionNom = (annonce.types_avion as any)?.nom || 'Avion';
      
      await admin.from('felitz_transactions').insert([
        {
          compte_id: compteAcheteurId,
          type: 'debit',
          montant: prixTotal,
          libelle: `Achat ${avionNom} (Hangar Market) - Taxe: ${taxe.toLocaleString('fr-FR')} F$`
        },
        {
          compte_id: compteVendeurId,
          type: 'credit',
          montant: annonce.prix,
          libelle: `Vente ${avionNom} (Hangar Market)`
        }
      ]);

      // Transférer l'avion
      if (annonce.inventaire_avion_id) {
        if (pour_compagnie_id) {
          // Inventaire -> Flotte : supprimer de l'inventaire, ajouter à la flotte
          await admin.from('inventaire_avions').delete().eq('id', annonce.inventaire_avion_id);
          
          // Vérifier si type existe déjà dans la flotte
          const { data: existingFlotte } = await admin.from('compagnie_flotte')
            .select('id, quantite')
            .eq('compagnie_id', pour_compagnie_id)
            .eq('type_avion_id', annonce.type_avion_id)
            .single();

          if (existingFlotte) {
            await admin.from('compagnie_flotte')
              .update({ quantite: existingFlotte.quantite + 1 })
              .eq('id', existingFlotte.id);
          } else {
            await admin.from('compagnie_flotte').insert({
              compagnie_id: pour_compagnie_id,
              type_avion_id: annonce.type_avion_id,
              quantite: 1
            });
          }
        } else {
          // Inventaire -> Inventaire : changer le propriétaire
          await admin.from('inventaire_avions')
            .update({ proprietaire_id: user.id })
            .eq('id', annonce.inventaire_avion_id);
        }
      } else if (annonce.flotte_avion_id) {
        // Retirer de la flotte vendeur
        const { data: flotteVendeur } = await admin.from('compagnie_flotte')
          .select('id, quantite')
          .eq('id', annonce.flotte_avion_id)
          .single();

        if (flotteVendeur) {
          if (flotteVendeur.quantite <= 1) {
            await admin.from('compagnie_flotte').delete().eq('id', flotteVendeur.id);
          } else {
            await admin.from('compagnie_flotte')
              .update({ quantite: flotteVendeur.quantite - 1 })
              .eq('id', flotteVendeur.id);
          }
        }

        if (pour_compagnie_id) {
          // Flotte -> Flotte
          const { data: existingFlotte } = await admin.from('compagnie_flotte')
            .select('id, quantite')
            .eq('compagnie_id', pour_compagnie_id)
            .eq('type_avion_id', annonce.type_avion_id)
            .single();

          if (existingFlotte) {
            await admin.from('compagnie_flotte')
              .update({ quantite: existingFlotte.quantite + 1 })
              .eq('id', existingFlotte.id);
          } else {
            await admin.from('compagnie_flotte').insert({
              compagnie_id: pour_compagnie_id,
              type_avion_id: annonce.type_avion_id,
              quantite: 1
            });
          }
        } else {
          // Flotte -> Inventaire
          await admin.from('inventaire_avions').insert({
            proprietaire_id: user.id,
            type_avion_id: annonce.type_avion_id
          });
        }
      }

      // Marquer comme vendu
      await admin.from('hangar_market')
        .update({
          statut: 'vendu',
          acheteur_id,
          compagnie_acheteur_id,
          vendu_at: new Date().toISOString()
        })
        .eq('id', annonce_id);

      return NextResponse.json({ 
        ok: true, 
        message: `${avionNom} acheté pour ${prixTotal.toLocaleString('fr-FR')} F$ (dont ${taxe.toLocaleString('fr-FR')} F$ de taxe)` 
      });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (e) {
    console.error('Hangar Market POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier une annonce
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { id, titre, description, prix, etat } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();

    // Vérifier propriété
    const { data: annonce } = await admin.from('hangar_market')
      .select('vendeur_id, compagnie_vendeur_id, statut')
      .eq('id', id)
      .single();

    if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 });
    if (annonce.statut !== 'en_vente') return NextResponse.json({ error: 'Cette annonce n\'est plus modifiable' }, { status: 400 });

    // Vérifier autorisation
    const isOwner = annonce.vendeur_id === user.id;
    let isPdg = false;
    if (annonce.compagnie_vendeur_id) {
      const { data: compagnie } = await admin.from('compagnies')
        .select('pdg_id')
        .eq('id', annonce.compagnie_vendeur_id)
        .single();
      isPdg = compagnie?.pdg_id === user.id;
    }

    if (!isOwner && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (titre) updates.titre = titre;
    if (description !== undefined) updates.description = description;
    if (prix && prix > 0) updates.prix = prix;
    if (etat) updates.etat = etat;

    const { error } = await admin.from('hangar_market')
      .update(updates)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Hangar Market PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Annuler une annonce
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();

    // Vérifier propriété
    const { data: annonce } = await admin.from('hangar_market')
      .select('vendeur_id, compagnie_vendeur_id, statut')
      .eq('id', id)
      .single();

    if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 });
    if (annonce.statut !== 'en_vente') return NextResponse.json({ error: 'Cette annonce ne peut plus être annulée' }, { status: 400 });

    // Vérifier autorisation
    const isOwner = annonce.vendeur_id === user.id;
    let isPdg = false;
    if (annonce.compagnie_vendeur_id) {
      const { data: compagnie } = await admin.from('compagnies')
        .select('pdg_id')
        .eq('id', annonce.compagnie_vendeur_id)
        .single();
      isPdg = compagnie?.pdg_id === user.id;
    }
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    if (!isOwner && !isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Annuler l'annonce
    const { error } = await admin.from('hangar_market')
      .update({ statut: 'annulé' })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Hangar Market DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
