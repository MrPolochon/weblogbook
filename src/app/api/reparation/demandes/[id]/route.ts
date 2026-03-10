import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: demande } = await admin.from('reparation_demandes')
    .select('*, entreprises_reparation(id, nom), compagnies(id, nom), compagnie_avions(id, immatriculation, nom, usure), reparation_hangars(id, aeroport_code, nom)')
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
    const { data: emp } = await admin.from('reparation_employes')
      .select('id').eq('entreprise_id', demande.entreprise_id).eq('user_id', user!.id).limit(1);
    return !!emp?.length;
  }

  async function isCompagniePdg(): Promise<boolean> {
    const { data: comp } = await admin.from('compagnies')
      .select('pdg_id').eq('id', demande.compagnie_id).single();
    return comp?.pdg_id === user!.id;
  }

  if (action === 'accepter') {
    if (!await isEntrepriseStaff()) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (demande.statut !== 'demandee') return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });

    await admin.from('reparation_demandes').update({
      statut: 'acceptee', acceptee_at: new Date().toISOString(),
      commentaire_entreprise: body.commentaire || null,
    }).eq('id', id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', demande.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `✅ Réparation acceptée`,
        contenu: `Votre demande de réparation a été acceptée. L'avion doit être acheminé vers le hangar.${body.commentaire ? `\nMessage : ${body.commentaire}` : ''}`,
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

    await admin.from('reparation_demandes').update({
      statut: 'en_reparation', debut_reparation_at: new Date().toISOString(),
    }).eq('id', id);
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
      .select('score').eq('demande_id', id);
    const scoresMoyenne = scores?.length ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length) : 75;

    let usureApres = 0;
    if (scoresMoyenne >= 90) usureApres = 0;
    else if (scoresMoyenne >= 70) usureApres = Math.round((demande.usure_avant || 0) * (1 - scoresMoyenne / 100));
    else if (scoresMoyenne >= 50) usureApres = Math.round((demande.usure_avant || 0) * 0.3);
    else usureApres = Math.round((demande.usure_avant || 0) * 0.5);

    const { data: tarif } = await admin.from('reparation_tarifs')
      .select('prix_par_point')
      .eq('entreprise_id', demande.entreprise_id)
      .limit(1).single();
    const prixParPoint = tarif?.prix_par_point || 1000;
    const pointsRepares = Math.max(0, (demande.usure_avant || 0) - usureApres);
    const prixTotal = pointsRepares * prixParPoint;

    await admin.from('reparation_demandes').update({
      statut: 'terminee',
      fin_reparation_at: new Date().toISOString(),
      usure_apres: usureApres,
      score_qualite: scoresMoyenne,
      prix_total: prixTotal,
    }).eq('id', id);

    await admin.from('compagnie_avions').update({ usure: usureApres }).eq('id', demande.avion_id);

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
        contenu: `La réparation est terminée.\nScore qualité : ${demande.score_qualite || 0}/100\nUsure : ${demande.usure_avant}% → ${demande.usure_apres}%\n\nMontant à payer : ${(demande.prix_total || 0).toLocaleString('fr-FR')} F$\n\nRendez-vous dans la section Réparation pour payer.`,
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

    const { data: debit } = await admin.rpc('debiter_compte_safe', {
      p_compagnie_id: demande.compagnie_id,
      p_montant: demande.prix_total,
      p_libelle: `Réparation avion`,
    });
    if (!debit?.success) return NextResponse.json({ error: debit?.error || 'Fonds insuffisants' }, { status: 400 });

    const { data: compteRep } = await admin.from('felitz_comptes')
      .select('id, solde').eq('entreprise_reparation_id', demande.entreprise_id).eq('type', 'reparation').single();
    if (compteRep) {
      await admin.from('felitz_comptes').update({ solde: compteRep.solde + demande.prix_total }).eq('id', compteRep.id);
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

    if (livraison === 'parking') {
      const { data: hangar } = await admin.from('reparation_hangars').select('aeroport_code').eq('id', demande.hangar_id).single();
      if (hangar) {
        await admin.from('compagnie_avions').update({ localisation: hangar.aeroport_code }).eq('id', demande.avion_id);
      }
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
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
}
