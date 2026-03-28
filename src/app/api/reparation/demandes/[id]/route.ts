import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCoPdg } from '@/lib/co-pdg-utils';
import { getGamesForDemande } from '@/lib/reparation-games';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: demande } = await admin.from('reparation_demandes')
    .select('*, entreprises_reparation(id, nom), compagnies(id, nom), compagnie_avions(id, immatriculation, nom_bapteme, usure_percent), reparation_hangars(id, aeroport_code, nom)')
    .eq('id', id).single();
  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });

  const { data: scores } = await admin.from('reparation_mini_jeux_scores')
    .select('*').eq('demande_id', id);

  const normalize = (raw: unknown) => Array.isArray(raw) ? raw[0] : raw;

  return NextResponse.json({
    ...demande,
    entreprise: normalize(demande.entreprises_reparation) || null,
    compagnie: normalize(demande.compagnies) || null,
    avion: normalize(demande.compagnie_avions) || null,
    hangar: normalize(demande.reparation_hangars) || null,
    scores: scores || [],
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: demande } = await admin.from('reparation_demandes').select('*').eq('id', id).single();
  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  async function isEntrepriseStaff(): Promise<boolean> {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
    if (profile?.role === 'admin') return true;
    const { data: emp } = await admin.from('reparation_employes')
      .select('id').eq('entreprise_id', demande.entreprise_id).eq('user_id', user!.id).limit(1);
    return !!emp?.length;
  }

  async function isCompagniePdg(): Promise<boolean> {
    const { data: comp } = await admin.from('compagnies')
      .select('id, pdg_id').eq('id', demande.compagnie_id).single();
    if (!comp) return false;
    if (comp.pdg_id === user!.id) return true;
    return isCoPdg(user!.id, comp.id, admin);
  }

  if (action === 'accepter') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'demandee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'acceptee', acceptee_at: new Date().toISOString(),
      commentaire_entreprise: body.commentaire || null,
    }).eq('id', id);

    await admin.from('compagnie_avions').update({ statut: 'en_reparation' }).eq('id', demande.avion_id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `✅ Réparation acceptée`,
        contenu: `Votre demande de réparation a été acceptée. L'avion est maintenant bloqué au hangar jusqu'à la fin de la réparation et le paiement.${body.commentaire ? `\nMessage : ${body.commentaire}` : ''}`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'refuser') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'demandee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'refusee',
      commentaire_entreprise: body.commentaire || null,
    }).eq('id', id);

    const { data: avionActuel } = await admin.from('compagnie_avions').select('statut').eq('id', demande.avion_id).single();
    if (avionActuel?.statut === 'en_reparation') {
      await admin.from('compagnie_avions').update({ statut: 'ground' }).eq('id', demande.avion_id);
    }

    const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `❌ Réparation refusée`,
        contenu: `Votre demande de réparation a été refusée.${body.commentaire ? `\nMotif : ${body.commentaire}` : ''}`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'ferry_arrive') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (!['acceptee', 'en_transit'].includes(demande.statut)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    const { data: hangar } = await admin
      .from('reparation_hangars')
      .select('aeroport_code')
      .eq('id', demande.hangar_id)
      .single();
    if (!hangar) return NextResponse.json({ error: 'Hangar introuvable' }, { status: 400 });

    const { data: avionCurrent } = await admin
      .from('compagnie_avions')
      .select('id, immatriculation, aeroport_actuel')
      .eq('id', demande.avion_id)
      .single();
    if (!avionCurrent) return NextResponse.json({ error: 'Avion introuvable' }, { status: 400 });

    // Cas 1: demande de transfert entreprise => on déplace l'avion vers le hangar et on facture la compagnie
    if (demande.statut === 'en_transit') {
      const { data: taxesData } = await admin.from('taxes_aeroport')
        .select('taxe_pourcent')
        .eq('code_oaci', hangar.aeroport_code)
        .single();
      const tauxTaxe = taxesData?.taxe_pourcent || 2;
      const taxesTransfert = Math.round(COUT_VOL_FERRY * tauxTaxe / 100);
      const coutTransfert = COUT_VOL_FERRY + taxesTransfert;

      const { data: compteComp } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', demande.compagnie_id)
        .eq('type', 'entreprise')
        .single();
      if (!compteComp) return NextResponse.json({ error: 'Compte entreprise introuvable' }, { status: 400 });
      if (compteComp.solde < coutTransfert) {
        return NextResponse.json({
          error: `Solde insuffisant pour le transfert vers le hangar (${coutTransfert.toLocaleString('fr-FR')} F$).`
        }, { status: 400 });
      }

      const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
        p_compte_id: compteComp.id,
        p_montant: coutTransfert,
      });
      if (!debitOk) {
        return NextResponse.json({ error: 'Solde insuffisant (transaction concurrente)' }, { status: 400 });
      }

      await admin.from('felitz_transactions').insert({
        compte_id: compteComp.id,
        type: 'debit',
        montant: COUT_VOL_FERRY,
        libelle: `Transfert réparation ${avionCurrent.immatriculation} vers ${hangar.aeroport_code}`,
      });
      if (taxesTransfert > 0) {
        await admin.from('felitz_transactions').insert({
          compte_id: compteComp.id,
          type: 'debit',
          montant: taxesTransfert,
          libelle: `Taxes aéroportuaires ${hangar.aeroport_code} (transfert réparation)`,
        });
      }

      const { data: compteRep } = await admin.from('felitz_comptes')
        .select('id')
        .eq('entreprise_reparation_id', demande.entreprise_id)
        .eq('type', 'reparation')
        .maybeSingle();
      if (compteRep?.id) {
        await admin.rpc('crediter_compte_safe', { p_compte_id: compteRep.id, p_montant: coutTransfert });
        await admin.from('felitz_transactions').insert({
          compte_id: compteRep.id,
          type: 'credit',
          montant: coutTransfert,
          libelle: `Transfert pris en charge pour ${avionCurrent.immatriculation}`,
        });
      }

      await admin.from('compagnie_avions').update({
        aeroport_actuel: hangar.aeroport_code,
        statut: 'en_reparation',
      }).eq('id', demande.avion_id);
    } else {
      // Cas 2: la compagnie a acheminé l'avion elle-même => il doit déjà être au hangar
      if (avionCurrent.aeroport_actuel !== hangar.aeroport_code) {
        return NextResponse.json({
          error: `L'avion n'est pas encore au hangar (${hangar.aeroport_code}). Faites un vol ferry vers ce hangar ou demandez le transfert à l'entreprise.`
        }, { status: 400 });
      }
      await admin.from('compagnie_avions').update({ statut: 'en_reparation' }).eq('id', demande.avion_id);
    }

    await admin.from('reparation_demandes').update({
      statut: 'en_reparation', debut_reparation_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'demander_transfert_hangar') {
    if (!await isCompagniePdg()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'acceptee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({ statut: 'en_transit' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'demarrer_mini_jeux') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'en_reparation') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({ statut: 'mini_jeux' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'terminer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (!['en_reparation', 'mini_jeux'].includes(demande.statut)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    const { data: scores } = await admin.from('reparation_mini_jeux_scores')
      .select('score, type_jeu').eq('demande_id', id);

    const requiredGames = getGamesForDemande(id);
    const completedGames = new Set((scores || []).map(s => s.type_jeu));
    const missingGames = requiredGames.filter(g => !completedGames.has(g));
    if (missingGames.length > 0) {
      return NextResponse.json({
        error: `Mini-jeux incomplets : ${missingGames.join(', ')}. Les 4 mini-jeux assignés doivent être complétés.`
      }, { status: 400 });
    }

    const scoresMoyenne = Math.round((scores || []).reduce((s, sc) => s + sc.score, 0) / (scores?.length || 1));

    const santeBefore = demande.usure_avant ?? 0;
    const manque = 100 - santeBefore;
    let usureApres: number;
    if (scoresMoyenne >= 90) usureApres = 100;
    else if (scoresMoyenne >= 70) usureApres = Math.min(100, Math.round(santeBefore + manque * scoresMoyenne / 100));
    else if (scoresMoyenne >= 50) usureApres = Math.min(100, Math.round(santeBefore + manque * 0.5));
    else usureApres = Math.min(100, Math.round(santeBefore + manque * 0.3));

    const { data: ent } = await admin.from('entreprises_reparation')
      .select('alliance_reparation_actif, alliance_id, prix_alliance_pourcent')
      .eq('id', demande.entreprise_id).single();
    const { data: avionForTarif } = await admin.from('compagnie_avions')
      .select('type_avion_id').eq('id', demande.avion_id).single();
    let tarif = null;
    if (avionForTarif?.type_avion_id) {
      const { data: t } = await admin.from('reparation_tarifs')
        .select('prix_par_point')
        .eq('entreprise_id', demande.entreprise_id)
        .eq('type_avion_id', avionForTarif.type_avion_id)
        .limit(1).maybeSingle();
      tarif = t;
    }
    if (!tarif) {
      const { data: t } = await admin.from('reparation_tarifs')
        .select('prix_par_point')
        .eq('entreprise_id', demande.entreprise_id)
        .is('type_avion_id', null)
        .limit(1).maybeSingle();
      tarif = t;
    }
    if (!tarif) {
      const { data: t } = await admin.from('reparation_tarifs')
        .select('prix_par_point')
        .eq('entreprise_id', demande.entreprise_id)
        .limit(1).maybeSingle();
      tarif = t;
    }
    let prixParPoint = tarif?.prix_par_point || 1000;
    if (ent?.alliance_reparation_actif && ent.alliance_id && ent.prix_alliance_pourcent != null) {
      const { data: membre } = await admin.from('alliance_membres')
        .select('id').eq('alliance_id', ent.alliance_id).eq('compagnie_id', demande.compagnie_id).limit(1);
      if (membre?.length) {
        prixParPoint = Math.round(prixParPoint * (ent.prix_alliance_pourcent / 100));
      }
    }
    const pointsRepares = Math.max(0, usureApres - (demande.usure_avant || 0));
    const prixTotal = pointsRepares * prixParPoint;

    await admin.from('reparation_demandes').update({
      statut: 'terminee',
      fin_reparation_at: new Date().toISOString(),
      usure_apres: usureApres,
      score_qualite: scoresMoyenne,
      prix_total: prixTotal,
    }).eq('id', id);

    await admin.from('compagnie_avions').update({ usure_percent: usureApres, statut: 'en_reparation' }).eq('id', demande.avion_id);

    return NextResponse.json({ ok: true, score: scoresMoyenne, usure_apres: usureApres, prix_total: prixTotal });
  }

  if (action === 'facturer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'terminee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'facturee', facturee_at: new Date().toISOString(),
    }).eq('id', id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', demande.compagnie_id).single();
    const { data: avion } = await admin.from('compagnie_avions').select('immatriculation').eq('id', demande.avion_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `💰 Facture réparation — ${avion?.immatriculation || 'Avion'}`,
        contenu: `La reparation est terminee.\nScore qualite : ${demande.score_qualite || 0}/100\nUsure : ${demande.usure_avant}% -> ${demande.usure_apres}%\n\nMontant a payer : ${(demande.prix_total || 0).toLocaleString('fr-FR')} F$\n\nRendez-vous dans Ma Compagnie pour payer.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'payer') {
    if (!await isCompagniePdg()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'facturee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    if (!demande.prix_total || demande.prix_total <= 0) {
      await admin.from('reparation_demandes').update({ statut: 'payee', payee_at: new Date().toISOString() }).eq('id', id);
      return NextResponse.json({ ok: true });
    }

    const { data: compteComp } = await admin.from('felitz_comptes')
      .select('id, solde, vban')
      .eq('compagnie_id', demande.compagnie_id)
      .eq('type', 'entreprise')
      .single();
    if (!compteComp) return NextResponse.json({ error: 'Compte Felitz de la compagnie introuvable' }, { status: 400 });
    if (compteComp.solde < demande.prix_total) return NextResponse.json({ error: 'Fonds insuffisants' }, { status: 400 });

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compteComp.id,
      p_montant: demande.prix_total,
    });
    if (!debitOk) return NextResponse.json({ error: 'Fonds insuffisants' }, { status: 400 });

    await admin.from('felitz_transactions').insert({
      compte_id: compteComp.id,
      type: 'debit',
      montant: demande.prix_total,
      libelle: `Reparation avion — demande ${id.slice(0, 8)}`,
    });

    const { data: compteRep } = await admin.from('felitz_comptes')
      .select('id').eq('entreprise_reparation_id', demande.entreprise_id).eq('type', 'reparation').single();
    if (compteRep) {
      await admin.rpc('crediter_compte_safe', { p_compte_id: compteRep.id, p_montant: demande.prix_total });
      await admin.from('felitz_transactions').insert({
        compte_id: compteRep.id,
        type: 'credit',
        montant: demande.prix_total,
        libelle: `Paiement reparation — ${compteComp.vban || '?'}`,
      });
    }

    await admin.from('reparation_demandes').update({ statut: 'payee', payee_at: new Date().toISOString() }).eq('id', id);

    const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id, nom').eq('id', demande.entreprise_id).single();
    if (ent) {
      await admin.from('messages').insert({
        destinataire_id: ent.pdg_id,
        titre: `💰 Paiement reçu — ${demande.prix_total.toLocaleString('fr-FR')} F$`,
        contenu: `Le paiement de la réparation a été reçu. Vous pouvez organiser le retour de l'avion ou le laisser au parking.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'completer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (!['payee', 'retour_transit'].includes(demande.statut)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    const livraison = body.livraison || 'parking';

    const { data: hangar } = await admin.from('reparation_hangars').select('aeroport_code').eq('id', demande.hangar_id).single();
    if (livraison === 'parking') {
      if (hangar) {
        await admin.from('compagnie_avions').update({ aeroport_actuel: hangar.aeroport_code, statut: 'disponible' }).eq('id', demande.avion_id);
      }
    } else {
      await admin.from('compagnie_avions').update({ statut: 'disponible' }).eq('id', demande.avion_id);
    }

    await admin.from('reparation_demandes').update({
      statut: 'completee', completee_at: new Date().toISOString(),
    }).eq('id', id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `✅ Réparation complète`,
        contenu: livraison === 'parking'
          ? `Votre avion réparé est disponible au parking de l'aéroport du hangar de réparation.`
          : `Votre avion est en cours de ferry retour vers sa base.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'annuler') {
    if (!await isCompagniePdg() && !await isEntrepriseStaff()) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    if (['completee', 'payee', 'facturee', 'annulee'].includes(demande.statut)) {
      return NextResponse.json({ error: 'Impossible d\'annuler à ce stade' }, { status: 400 });
    }

    await admin.from('reparation_demandes').update({ statut: 'annulee' }).eq('id', id);

    const { data: avionActuel } = await admin.from('compagnie_avions').select('statut').eq('id', demande.avion_id).single();
    if (avionActuel?.statut === 'en_reparation') {
      await admin.from('compagnie_avions').update({ statut: 'ground' }).eq('id', demande.avion_id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
}
