import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { isChefDeBrigade, getSiaviCompte } from '@/lib/siavi/permissions';
import { refreshMarketplaceRuptures, isTypeAvionEnRupture } from '@/lib/marketplace/ruptures';

// GET - Liste des avions disponibles à l'achat
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    await refreshMarketplaceRuptures(admin);
    const { data, error } = await admin.from('types_avion')
      .select('*')
      .gt('prix', 0)
      .order('prix', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Marketplace GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Acheter un avion
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rl = rateLimit(`marketplace:${user.id}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop d\'achats, réessayez dans une minute' }, { status: 429 });

    const body = await req.json();
    const { type_avion_id, pour_compagnie_id, nom_personnalise, pour_armee, pour_siavi } = body;

    if (!type_avion_id) {
      return NextResponse.json({ error: 'type_avion_id requis' }, { status: 400 });
    }
    const exclusifCount = [pour_armee, pour_compagnie_id, pour_siavi].filter(Boolean).length;
    if (exclusifCount > 1) {
      return NextResponse.json({ error: 'Choisissez une seule destination : compagnie, armée ou SIAVI.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer le prix de l'avion
    const { data: avion } = await admin.from('types_avion')
      .select('id, nom, prix, est_militaire')
      .eq('id', type_avion_id)
      .single();

    if (!avion || avion.prix <= 0) {
      return NextResponse.json({ error: 'Avion non disponible à la vente' }, { status: 400 });
    }

    // Verrou rupture de stock : empeche tout achat tant que la rupture en cours
    // n'est pas expiree (verifie sur la base, pas sur le payload client).
    const rupture = await isTypeAvionEnRupture(admin, type_avion_id);
    if (rupture.enRupture && rupture.finAt) {
      const fin = new Date(rupture.finAt);
      return NextResponse.json({
        error: `Rupture de stock : ${avion.nom} indisponible jusqu'au ${fin.toLocaleString('fr-FR')}.`,
      }, { status: 409 });
    }

    let compteId: string;
    let compagnieNom: string | null = null;

    if (pour_armee) {
      // Achat pour l'armée - réservé au PDG militaire
      if (!avion.est_militaire) {
        return NextResponse.json({ error: 'Seuls les avions militaires peuvent être achetés par l\'armée.' }, { status: 400 });
      }

      const { data: compteMilitaire } = await admin.from('felitz_comptes')
        .select('id, solde, proprietaire_id')
        .eq('type', 'militaire')
        .single();

      if (!compteMilitaire) {
        return NextResponse.json({ error: 'Compte militaire introuvable' }, { status: 404 });
      }

      if (compteMilitaire.proprietaire_id !== user.id) {
        return NextResponse.json({ error: 'Seul le PDG militaire peut acheter pour l\'armée' }, { status: 403 });
      }

      const soldeMilitaire = Number(compteMilitaire.solde);
      if (soldeMilitaire < avion.prix) {
        return NextResponse.json({ error: 'Solde militaire insuffisant' }, { status: 400 });
      }

      compteId = compteMilitaire.id;

      const { debiterFelitzAvecTrace, crediterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
      const debitRes = await debiterFelitzAvecTrace(admin, {
        compteId,
        montant: avion.prix,
        libelle: `Achat armée ${avion.nom}`,
      });
      if (!debitRes.ok) {
        return NextResponse.json({ error: 'Solde militaire insuffisant (transaction concurrente)' }, { status: 400 });
      }

      // Ajouter à l'inventaire de l'armée ; rollback avec trace si échec.
      const { error: insertArmeeErr } = await admin.from('armee_avions').insert({
        type_avion_id,
        nom_personnalise: nom_personnalise || null,
      });
      if (insertArmeeErr) {
        await crediterFelitzAvecTrace(admin, {
          compteId,
          montant: avion.prix,
          libelle: `Annulation achat armée ${avion.nom} (échec création)`,
        });
        return NextResponse.json({ error: 'Erreur lors de la création de l\'avion armée. Le compte a été recrédité.' }, { status: 500 });
      }

    } else if (pour_siavi) {
      // Achat pour la flotte SIAVI - réservé au Chef de brigade
      const chefOk = await isChefDeBrigade(admin, user.id);
      if (!chefOk) {
        return NextResponse.json({ error: 'Seul le Chef de brigade SIAVI peut acheter pour la flotte SIAVI.' }, { status: 403 });
      }

      const compteSiavi = await getSiaviCompte(admin);
      if (!compteSiavi) {
        return NextResponse.json({ error: 'Compte SIAVI introuvable' }, { status: 404 });
      }

      const soldeSiavi = Number(compteSiavi.solde);
      if (soldeSiavi < avion.prix) {
        return NextResponse.json({
          error: `Solde SIAVI insuffisant. Solde actuel : ${soldeSiavi.toLocaleString('fr-FR')} F$, prix : ${avion.prix.toLocaleString('fr-FR')} F$.`
        }, { status: 400 });
      }

      compteId = compteSiavi.id;

      const { debiterFelitzAvecTrace, crediterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
      const debitRes = await debiterFelitzAvecTrace(admin, {
        compteId,
        montant: avion.prix,
        libelle: `Achat flotte SIAVI ${avion.nom}`,
      });
      if (!debitRes.ok) {
        return NextResponse.json({ error: 'Solde SIAVI insuffisant (transaction concurrente)' }, { status: 400 });
      }

      const { data: immatSiavi } = await admin.rpc('generer_immatriculation', { prefixe: 'MED-' });
      const immatriculation = immatSiavi || `MED-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data: hubPrincipal } = await admin
        .from('siavi_hubs')
        .select('aeroport_oaci')
        .eq('is_principal', true)
        .maybeSingle();
      const aeroportInitial = hubPrincipal?.aeroport_oaci || 'IRFD';

      const { error: insertSiaviErr } = await admin.from('siavi_avions').insert({
        type_avion_id,
        immatriculation,
        nom_personnalise: nom_personnalise || null,
        aeroport_actuel: aeroportInitial,
        usure_percent: 100,
        statut: 'ground',
        prix_achat: avion.prix,
      });

      if (insertSiaviErr) {
        console.error('Marketplace: echec insert siavi_avions:', insertSiaviErr);
        await crediterFelitzAvecTrace(admin, {
          compteId,
          montant: avion.prix,
          libelle: `Annulation achat flotte SIAVI ${avion.nom} (échec création)`,
        });
        return NextResponse.json({
          error: `Erreur lors de la création de l'avion SIAVI. Le compte a été recrédité.`,
        }, { status: 500 });
      }

    } else if (pour_compagnie_id) {
      // Achat pour une compagnie - vérifier que l'utilisateur est PDG
      const { data: compagnie } = await admin.from('compagnies')
        .select('id, nom, pdg_id')
        .eq('id', pour_compagnie_id)
        .single();

      if (!compagnie) {
        return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
      }

      if (compagnie.pdg_id !== user.id) {
        return NextResponse.json({ error: 'Seul le PDG peut acheter pour la compagnie' }, { status: 403 });
      }

      // Vérifier l'autorisation d'exploitation pour ce type d'avion
      const { data: autorisationExploit } = await admin.from('autorisations_exploitation')
        .select('id')
        .eq('compagnie_id', pour_compagnie_id)
        .eq('type_avion_id', type_avion_id)
        .eq('statut', 'approuvee')
        .maybeSingle();

      if (!autorisationExploit) {
        return NextResponse.json({
          error: `Votre compagnie n'a pas d'autorisation d'exploitation approuvée pour le ${avion.nom}. Faites une demande auprès de l'IFSA depuis "Ma compagnie".`
        }, { status: 403 });
      }

      // Recuperer le compte entreprise (canonique = le plus ancien si doublons,
      // pour rester coherent avec marketplace/page.tsx et eviter qu'un LIMIT 1
      // sans ordre selectionne une ligne differente entre l'affichage et le debit).
      let compteEntreprise = (await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', pour_compagnie_id)
        .eq('type', 'entreprise')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()).data;

      // Créer le compte entreprise s'il n'existe pas (compagnies créées avant le trigger Felitz)
      if (!compteEntreprise) {
        const { data: comp } = await admin.from('compagnies')
          .select('id, vban')
          .eq('id', pour_compagnie_id)
          .single();
        if (!comp) {
          return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
        }
        let vban = comp.vban;
        if (!vban) {
          const prefix = 'ENTERMIXOU';
          let unique = false;
          do {
            vban = prefix + Array.from({ length: 16 }, () =>
              'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
            ).join('');
            const { data: ex } = await admin.from('felitz_comptes').select('id').eq('vban', vban).maybeSingle();
            const { data: exComp } = await admin.from('compagnies').select('id').eq('vban', vban).maybeSingle();
            unique = !ex && !exComp;
          } while (!unique);
          await admin.from('compagnies').update({ vban }).eq('id', pour_compagnie_id);
        }
        const { data: created } = await admin.from('felitz_comptes').insert({
          type: 'entreprise',
          compagnie_id: pour_compagnie_id,
          vban,
          solde: 0
        }).select('id, solde').single();
        if (created) compteEntreprise = created;
      }

      if (!compteEntreprise) {
        return NextResponse.json({ error: 'Compte entreprise introuvable' }, { status: 404 });
      }

      const solde = Number(compteEntreprise.solde);
      if (solde < avion.prix) {
        return NextResponse.json({
          error: `Solde entreprise insuffisant. Solde actuel : ${solde.toLocaleString('fr-FR')} F$, prix : ${avion.prix.toLocaleString('fr-FR')} F$.`
        }, { status: 400 });
      }

      compteId = compteEntreprise.id;
      compagnieNom = compagnie.nom;

      const { debiterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
      const debitRes = await debiterFelitzAvecTrace(admin, {
        compteId,
        montant: avion.prix,
        libelle: `Achat ${avion.nom}`,
      });
      if (!debitRes.ok) {
        // Diagnostic precis : on relit le solde reel pour distinguer
        // "vraiment pas assez" / "RPC a renvoye une erreur" / "compte introuvable".
        const { data: rcheck } = await admin.from('felitz_comptes')
          .select('solde').eq('id', compteId).maybeSingle();
        const realSolde = Number(rcheck?.solde ?? NaN);
        let userMsg: string;
        if (Number.isFinite(realSolde) && realSolde < avion.prix) {
          userMsg = `Solde entreprise insuffisant. Solde actuel : ${realSolde.toLocaleString('fr-FR')} F$, prix : ${avion.prix.toLocaleString('fr-FR')} F$.`;
        } else if (debitRes.error) {
          userMsg = `Echec du debit : ${debitRes.error}`;
        } else {
          userMsg = `Echec du debit (solde verifie : ${Number.isFinite(realSolde) ? realSolde.toLocaleString('fr-FR') + ' F$' : 'inconnu'}). Reessayez ; si le probleme persiste contactez un admin.`;
        }
        console.error('[marketplace] debit entreprise echoue', { compteId, montant: avion.prix, realSolde, rpcError: debitRes.error });
        return NextResponse.json({ error: userMsg }, { status: 400 });
      }

      // Générer une immatriculation unique
      const { data: immatData } = await admin.rpc('generer_immatriculation', { prefixe: 'F-' });
      const immatriculation = immatData || `F-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Trouver le hub principal pour l'aéroport initial
      const { data: hubPrincipal } = await admin
        .from('compagnie_hubs')
        .select('aeroport_code')
        .eq('compagnie_id', pour_compagnie_id)
        .eq('est_hub_principal', true)
        .maybeSingle();
      const aeroportInitial = hubPrincipal?.aeroport_code || 'IRFD';

      // Créer l'avion individuel
      const { error: insertAvionErr } = await admin.from('compagnie_avions').insert({
        compagnie_id: pour_compagnie_id,
        type_avion_id,
        immatriculation,
        nom_bapteme: nom_personnalise || null,
        aeroport_actuel: aeroportInitial,
        usure_percent: 100,
        statut: 'ground',
        prix_achat: avion.prix,
      });

      if (insertAvionErr) {
        console.error('Marketplace: echec insert compagnie_avions:', insertAvionErr);
        const { crediterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
        await crediterFelitzAvecTrace(admin, {
          compteId,
          montant: avion.prix,
          libelle: `Annulation achat ${avion.nom} (échec création avion)`,
        });
        return NextResponse.json({
          error: `Erreur lors de la création de l'avion (${insertAvionErr.code || 'unknown'}: ${insertAvionErr.message}). Le compte a été recrédité.`,
          details: insertAvionErr,
        }, { status: 500 });
      }

    } else {
      // Achat personnel (canonique = le plus ancien si doublons).
      const { data: comptePerso } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('proprietaire_id', user.id)
        .eq('type', 'personnel')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!comptePerso) {
        return NextResponse.json({ error: 'Compte personnel introuvable' }, { status: 404 });
      }

      const soldePerso = Number(comptePerso.solde);
      if (soldePerso < avion.prix) {
        return NextResponse.json({
          error: `Solde insuffisant. Solde actuel : ${soldePerso.toLocaleString('fr-FR')} F$, prix : ${avion.prix.toLocaleString('fr-FR')} F$.`
        }, { status: 400 });
      }

      compteId = comptePerso.id;

      const { debiterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
      const debitRes = await debiterFelitzAvecTrace(admin, {
        compteId,
        montant: avion.prix,
        libelle: `Achat ${avion.nom}`,
      });
      if (!debitRes.ok) {
        const { data: rcheck } = await admin.from('felitz_comptes')
          .select('solde').eq('id', compteId).maybeSingle();
        const realSolde = Number(rcheck?.solde ?? NaN);
        let userMsg: string;
        if (Number.isFinite(realSolde) && realSolde < avion.prix) {
          userMsg = `Solde insuffisant. Solde actuel : ${realSolde.toLocaleString('fr-FR')} F$, prix : ${avion.prix.toLocaleString('fr-FR')} F$.`;
        } else if (debitRes.error) {
          userMsg = `Echec du debit : ${debitRes.error}`;
        } else {
          userMsg = `Echec du debit (solde verifie : ${Number.isFinite(realSolde) ? realSolde.toLocaleString('fr-FR') + ' F$' : 'inconnu'}). Reessayez ; si le probleme persiste contactez un admin.`;
        }
        console.error('[marketplace] debit personnel echoue', { compteId, montant: avion.prix, realSolde, rpcError: debitRes.error });
        return NextResponse.json({ error: userMsg }, { status: 400 });
      }

      // Générer une immatriculation unique
      const { data: immatPerso } = await admin.rpc('generer_immatriculation', { prefixe: 'F-' });
      const immatPersonnel = immatPerso || `F-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Ajouter à l'inventaire personnel
      const { error: insertPersoErr } = await admin.from('inventaire_avions').insert({
        proprietaire_id: user.id,
        type_avion_id,
        nom_personnalise,
        immatriculation: immatPersonnel,
        aeroport_actuel: null,
        prix_achat: avion.prix,
      });

      if (insertPersoErr) {
        console.error('Marketplace: echec insert inventaire_avions:', insertPersoErr);
        const { crediterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
        await crediterFelitzAvecTrace(admin, {
          compteId,
          montant: avion.prix,
          libelle: `Annulation achat ${avion.nom} (échec création avion)`,
        });
        return NextResponse.json({
          error: `Erreur lors de la création de l'avion (${insertPersoErr.code || 'unknown'}: ${insertPersoErr.message}). Le compte a été recrédité.`,
          details: insertPersoErr,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      ok: true, 
      message: pour_siavi
        ? `${avion.nom} ajouté à la flotte SIAVI`
        : pour_compagnie_id 
          ? `${avion.nom} ajouté à la flotte de ${compagnieNom}` 
          : `${avion.nom} ajouté à votre inventaire`
    });
  } catch (e) {
    console.error('Marketplace POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
