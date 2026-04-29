import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCoPdg } from '@/lib/co-pdg-utils';
import { getGamesForDemande } from '@/lib/reparation-games';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';
import { resolveAeroportBaseRetour } from '@/lib/reparation-after-ferry';

export const dynamic = 'force-dynamic';

/** Quand l’action demandée ne correspond pas au `statut` courant (évite le message peu clair « Statut invalide »). */
const ERR_REPARATION_STATUT = 'Cette action ne correspond pas à l’étape actuelle de la demande. Actualisez la page si besoin.';

const LIB_ETAPES_TERMINER: Record<string, string> = {
  demandee: 'demande en attente de réponse',
  acceptee: 'acceptée — acheminement vers le hangar',
  en_transit: 'transfert entreprise en cours',
  terminee: 'réparation déjà terminée',
  facturee: 'facturation en cours',
  payee: 'en attente de livraison / ferry retour',
  completee: 'déjà clôturée',
  refusee: 'demande refusée',
  annulee: 'demande annulée',
  retour_transit: 'retour ferry client en cours',
};

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

  const { data: profileGet } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profileGet?.role !== 'admin') {
    const { data: empRep } = await admin.from('reparation_employes')
      .select('id').eq('entreprise_id', demande.entreprise_id).eq('user_id', user.id).limit(1);
    if (!empRep?.length) {
      const { data: compRow } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
      const isClientPdg =
        compRow?.pdg_id === user.id || (await isCoPdg(user.id, demande.compagnie_id, admin));
      if (!isClientPdg) {
        const { data: empComp } = await admin.from('compagnie_employes')
          .select('id').eq('compagnie_id', demande.compagnie_id).eq('pilote_id', user.id).limit(1);
        if (!empComp?.length) {
          return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }
      }
    }
  }

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
    if (demande.statut !== 'demandee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'acceptee', acceptee_at: new Date().toISOString(),
      commentaire_entreprise: body.commentaire || null,
    }).eq('id', id);

    // Ne pas passer l'avion en en_reparation ici : sinon le vol ferry vers le hangar est refusé
    // (voir POST /api/compagnies/vols-ferry). Le statut avion bascule à l'arrivée au hangar (ferry ou confirmation entreprise).

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `✅ Réparation acceptée`,
        contenu: `Votre demande de réparation a été acceptée. Acheminez l'avion vers le hangar (vol ferry depuis un hub, ou demandez le transfert à l'entreprise). Les vols ligne ne sont pas autorisés pendant cette phase.${body.commentaire ? `\nMessage : ${body.commentaire}` : ''}`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'refuser') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'demandee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

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
    if (!['acceptee', 'en_transit'].includes(demande.statut)) return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

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
    if (demande.statut !== 'acceptee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    await admin.from('reparation_demandes').update({ statut: 'en_transit' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'demarrer_mini_jeux') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'en_reparation') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    await admin.from('reparation_demandes').update({ statut: 'mini_jeux' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'terminer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (!['en_reparation', 'mini_jeux'].includes(demande.statut)) {
      const hint = LIB_ETAPES_TERMINER[demande.statut];
      return NextResponse.json({
        error: hint
          ? `Impossible de terminer — la demande est à l’étape : ${hint}. Actualisez la page si l’affichage ne correspond pas.`
          : ERR_REPARATION_STATUT,
      }, { status: 400 });
    }

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

    const { data: avionLive } = await admin
      .from('compagnie_avions')
      .select('usure_percent')
      .eq('id', demande.avion_id)
      .single();
    // Santé réelle au moment de la fin de réparation (l’avion peut avoir changé depuis la demande)
    const santeBefore = Math.max(
      0,
      Math.min(100, avionLive?.usure_percent ?? demande.usure_avant ?? 0),
    );
    const manque = 100 - santeBefore;
    let usureApres: number;
    if (scoresMoyenne >= 90) usureApres = 100;
    else if (scoresMoyenne >= 70) usureApres = Math.min(100, Math.round(santeBefore + manque * scoresMoyenne / 100));
    else if (scoresMoyenne >= 50) usureApres = Math.min(100, Math.round(santeBefore + manque * 0.5));
    else usureApres = Math.min(100, Math.round(santeBefore + manque * 0.3));

    usureApres = Math.max(0, Math.min(100, Math.round(Number(usureApres) || 0)));
    if (!Number.isFinite(usureApres)) {
      return NextResponse.json({ error: 'Calcul d’usure invalide après réparation.' }, { status: 500 });
    }

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
    const pointsRepares = Math.max(0, usureApres - santeBefore);
    const prixTotal = pointsRepares * prixParPoint;

    const { data: avionUpdated, error: avionUpdErr } = await admin
      .from('compagnie_avions')
      .update({ usure_percent: usureApres, statut: 'en_reparation' })
      .eq('id', demande.avion_id)
      .select('id')
      .maybeSingle();
    if (avionUpdErr) {
      console.error('reparation terminer: maj avion', avionUpdErr);
      const hint = 'message' in avionUpdErr ? String((avionUpdErr as { message?: string }).message || '') : '';
      const code = 'code' in avionUpdErr ? String((avionUpdErr as { code?: string }).code || '') : '';
      const detailMsg =
        code === '23514' || /check constraint|violates check/i.test(hint)
          ? ' Contrainte base de données sur le statut ou l’usure : exécutez sur Supabase le script supabase/fix_compagnie_avions_statut_check_reparation.sql.'
          : hint
            ? ` (${hint})`
            : '';
      return NextResponse.json(
        { error: `Mise à jour de l’avion impossible.${detailMsg}` },
        { status: 500 },
      );
    }
    if (!avionUpdated) {
      console.error('reparation terminer: aucune ligne avion pour id', demande.avion_id);
      return NextResponse.json({ error: 'Avion introuvable ou déjà supprimé.' }, { status: 404 });
    }

    const { error: demandeUpdErr } = await admin.from('reparation_demandes').update({
      statut: 'terminee',
      fin_reparation_at: new Date().toISOString(),
      usure_apres: usureApres,
      score_qualite: scoresMoyenne,
      prix_total: prixTotal,
    }).eq('id', id);
    if (demandeUpdErr) {
      console.error('reparation terminer: maj demande après avion', demandeUpdErr);
      const usureRevert = Math.max(0, Math.min(100, Math.round(santeBefore)));
      const { error: revErr } = await admin.from('compagnie_avions').update({
        usure_percent: usureRevert,
      }).eq('id', demande.avion_id);
      if (revErr) console.error('reparation terminer: rollback avion échoué', revErr);
      return NextResponse.json(
        { error: `L’avion a été mis à jour mais pas la demande de réparation. Contactez un admin. (${demandeUpdErr.message || 'erreur'})` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, score: scoresMoyenne, usure_apres: usureApres, prix_total: prixTotal });
  }

  if (action === 'facturer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'terminee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'facturee', facturee_at: new Date().toISOString(),
    }).eq('id', id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', demande.compagnie_id).single();
    const { data: avion } = await admin.from('compagnie_avions').select('immatriculation').eq('id', demande.avion_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `💰 Facture réparation — ${avion?.immatriculation || 'Avion'}`,
        contenu: `La reparation est terminee.\nScore qualite : ${demande.score_qualite || 0}/100\nEtat technique : ${demande.usure_avant}% -> ${demande.usure_apres}% (100% = pleine sante)\n\nMontant a payer : ${(demande.prix_total || 0).toLocaleString('fr-FR')} F$\n\nRendez-vous dans Ma Compagnie pour payer.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'payer') {
    if (!await isCompagniePdg()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const { data: demandePay } = await admin.from('reparation_demandes').select('*').eq('id', id).single();
    if (!demandePay) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    if (demandePay.statut !== 'facturee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    /** Garantit l’état de l’avion après paiement (filet de sécurité si la maj à « terminer » avait échoué). */
    const appliquerUsureApresPaiement = async () => {
      if (demandePay.usure_apres == null) return;
      const { error: uErr } = await admin
        .from('compagnie_avions')
        .update({ usure_percent: demandePay.usure_apres })
        .eq('id', demandePay.avion_id);
      if (uErr) console.error('reparation payer: sync usure avion', uErr);
    };

    if (!demandePay.prix_total || demandePay.prix_total <= 0) {
      await admin.from('reparation_demandes').update({ statut: 'payee', payee_at: new Date().toISOString() }).eq('id', id);
      await appliquerUsureApresPaiement();
      return NextResponse.json({ ok: true });
    }

    const { data: compteComp } = await admin.from('felitz_comptes')
      .select('id, solde, vban')
      .eq('compagnie_id', demandePay.compagnie_id)
      .eq('type', 'entreprise')
      .single();
    if (!compteComp) return NextResponse.json({ error: 'Compte Felitz de la compagnie introuvable' }, { status: 400 });
    if (compteComp.solde < demandePay.prix_total) return NextResponse.json({ error: 'Fonds insuffisants' }, { status: 400 });

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compteComp.id,
      p_montant: demandePay.prix_total,
    });
    if (!debitOk) return NextResponse.json({ error: 'Fonds insuffisants' }, { status: 400 });

    await admin.from('felitz_transactions').insert({
      compte_id: compteComp.id,
      type: 'debit',
      montant: demandePay.prix_total,
      libelle: `Reparation avion — demande ${id.slice(0, 8)}`,
    });

    const { data: compteRep } = await admin.from('felitz_comptes')
      .select('id').eq('entreprise_reparation_id', demandePay.entreprise_id).eq('type', 'reparation').single();
    if (compteRep) {
      await admin.rpc('crediter_compte_safe', { p_compte_id: compteRep.id, p_montant: demandePay.prix_total });
      await admin.from('felitz_transactions').insert({
        compte_id: compteRep.id,
        type: 'credit',
        montant: demandePay.prix_total,
        libelle: `Paiement reparation — ${compteComp.vban || '?'}`,
      });
    }

    await admin.from('reparation_demandes').update({ statut: 'payee', payee_at: new Date().toISOString() }).eq('id', id);
    await appliquerUsureApresPaiement();

    const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id, nom').eq('id', demandePay.entreprise_id).single();
    if (ent) {
      await admin.from('messages').insert({
        destinataire_id: ent.pdg_id,
        titre: `💰 Paiement reçu — ${demandePay.prix_total.toLocaleString('fr-FR')} F$`,
        contenu: `Le paiement de la réparation a été reçu. Vous pouvez organiser le retour de l'avion ou le laisser au parking.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'completer') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'payee') return NextResponse.json({ error: ERR_REPARATION_STATUT }, { status: 400 });

    const livraison = body.livraison || 'parking';

    const { data: hangar } = await admin.from('reparation_hangars').select('aeroport_code').eq('id', demande.hangar_id).single();
    const hangarCode = hangar?.aeroport_code ? String(hangar.aeroport_code).toUpperCase() : '';

    if (livraison === 'parking') {
      if (hangar) {
        await admin.from('compagnie_avions').update({ aeroport_actuel: hangar.aeroport_code, statut: 'disponible' }).eq('id', demande.avion_id);
      }
      await admin.from('reparation_demandes').update({
        statut: 'completee', completee_at: new Date().toISOString(),
      }).eq('id', id);

      const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
      if (comp) {
        await admin.from('messages').insert({
          destinataire_id: comp.pdg_id,
          titre: `✅ Réparation complète`,
          contenu: `Votre avion réparé est disponible au parking de l'aéroport du hangar de réparation.`,
          type_message: 'normal',
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Ferry retour : la demande reste ouverte (retour_transit) jusqu'à l'arrivée du vol ferry à la base enregistrée
    const baseCible = await resolveAeroportBaseRetour(admin, {
      compagnie_id: demande.compagnie_id,
      aeroport_depart_client: (demande as { aeroport_depart_client?: string | null }).aeroport_depart_client ?? null,
    });
    if (!baseCible) {
      return NextResponse.json({
        error: 'Impossible de déterminer l\'aéroport de retour. La compagnie doit avoir au moins un hub, ou la demande doit inclure l\'aéroport d\'origine (nouvelles demandes).',
      }, { status: 400 });
    }
    if (hangarCode && baseCible === hangarCode) {
      await admin.from('compagnie_avions').update({
        aeroport_actuel: baseCible,
        statut: 'disponible',
      }).eq('id', demande.avion_id);
      await admin.from('reparation_demandes').update({
        statut: 'completee', completee_at: new Date().toISOString(),
      }).eq('id', id);
      const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
      if (comp) {
        await admin.from('messages').insert({
          destinataire_id: comp.pdg_id,
          titre: `✅ Réparation complète`,
          contenu: `Votre avion est déjà sur sa base (${baseCible}).`,
          type_message: 'normal',
        });
      }
      return NextResponse.json({ ok: true, retour_aeroport: baseCible });
    }

    await admin.from('reparation_demandes').update({ statut: 'retour_transit' }).eq('id', id);
    await admin.from('compagnie_avions').update({ statut: 'ground' }).eq('id', demande.avion_id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `🔧 Réparation — retour par ferry`,
        contenu: `Votre avion est libéré au hangar. Créez un vol ferry (Ma compagnie → Vols ferry) vers ${baseCible}. La réparation sera clôturée automatiquement à l'arrivée du ferry.`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true, retour_aeroport: baseCible, attente_ferry: true });
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
