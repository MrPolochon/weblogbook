import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const myCompIds = await getLeaderCompagnieIds(user.id, admin);
  if (myCompIds.length === 0) return NextResponse.json({ error: 'Pas membre' }, { status: 403 });
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', myCompIds)
    .limit(1).single();
  if (!myMember) return NextResponse.json({ error: 'Pas membre' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { type_transfert, compagnie_avion_id, compagnie_dest_id, prix, duree_jours } = body;
  if (!type_transfert || !compagnie_avion_id) {
    return NextResponse.json({ error: 'type_transfert et compagnie_avion_id requis' }, { status: 400 });
  }
  if (!['vente', 'don', 'pret'].includes(type_transfert)) return NextResponse.json({ error: 'Type invalide' }, { status: 400 });

  const { data: avion } = await admin.from('compagnie_avions').select('id, compagnie_id').eq('id', compagnie_avion_id).single();
  if (!avion || !myCompIds.includes(avion.compagnie_id)) return NextResponse.json({ error: 'Avion non trouvé ou pas à vous' }, { status: 404 });

  // Prêt : destinataire obligatoire. Don et vente : destinataire optionnel (tout le monde peut claim/acheter)
  if (type_transfert === 'pret' && !compagnie_dest_id) {
    return NextResponse.json({ error: 'Le prêt nécessite un destinataire' }, { status: 400 });
  }
  if (compagnie_dest_id) {
    const { data: dest } = await admin.from('alliance_membres').select('id').eq('alliance_id', allianceId).eq('compagnie_id', compagnie_dest_id).single();
    if (!dest) return NextResponse.json({ error: 'Destination pas dans l\'alliance' }, { status: 400 });
  }

  const { data: allianceParams } = await admin.from('alliance_parametres')
    .select('transfert_avions_actif, pret_avions_actif, don_avions_actif')
    .eq('alliance_id', allianceId).single();

  if (type_transfert === 'vente' && !allianceParams?.transfert_avions_actif) {
    return NextResponse.json({ error: 'La vente d\'avions entre membres n\'est pas activée dans les paramètres de l\'alliance.' }, { status: 400 });
  }
  if (type_transfert === 'pret' && !allianceParams?.pret_avions_actif) {
    return NextResponse.json({ error: 'Le prêt d\'avions entre membres n\'est pas activé dans les paramètres de l\'alliance.' }, { status: 400 });
  }
  if (type_transfert === 'don' && !allianceParams?.don_avions_actif) {
    return NextResponse.json({ error: 'Le don d\'avions entre membres n\'est pas activé dans les paramètres de l\'alliance.' }, { status: 400 });
  }

  if (type_transfert === 'vente' && (!prix || prix < 0)) {
    return NextResponse.json({ error: 'Prix requis pour une vente' }, { status: 400 });
  }

  const { error } = await admin.from('alliance_transferts_avions').insert({
    alliance_id: allianceId,
    type_transfert,
    compagnie_avion_id,
    compagnie_source_id: avion.compagnie_id,
    compagnie_dest_id: compagnie_dest_id || null,
    prix: type_transfert === 'vente' ? (prix || 0) : null,
    duree_jours: type_transfert === 'pret' ? (duree_jours || 7) : null,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notification uniquement si destinataire spécifique
  if (compagnie_dest_id) {
    const { data: destComp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', compagnie_dest_id).single();
    if (destComp) {
      await admin.from('messages').insert({
        destinataire_id: destComp.pdg_id,
        titre: `✈️ Proposition de ${type_transfert} d'avion`,
        contenu: `Un membre de l'alliance vous propose un ${type_transfert} d'avion. Consultez la section Alliance > Flotte.`,
        type_message: 'normal',
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const myCompIds = await getLeaderCompagnieIds(user.id, admin);
  if (myCompIds.length === 0) return NextResponse.json({ error: 'Pas autorisé' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { transfert_id, action, compagnie_dest_id: claimCompagnieId } = body;
  if (!transfert_id || !['accepter', 'refuser'].includes(action)) {
    return NextResponse.json({ error: 'transfert_id et action requis' }, { status: 400 });
  }

  const { data: t } = await admin.from('alliance_transferts_avions')
    .select('*')
    .eq('id', transfert_id).eq('alliance_id', allianceId).single();
  if (!t || t.statut !== 'en_attente') return NextResponse.json({ error: 'Transfert introuvable ou déjà traité' }, { status: 404 });

  const destId = t.compagnie_dest_id ?? claimCompagnieId;
  if (!destId) return NextResponse.json({ error: 'Indiquez la compagnie qui récupère l\'avion (claim)' }, { status: 400 });

  const { data: destMember } = await admin.from('alliance_membres')
    .select('id').eq('alliance_id', allianceId).eq('compagnie_id', destId).single();
  if (!destMember) return NextResponse.json({ error: 'Compagnie pas dans l\'alliance' }, { status: 400 });

  if (!myCompIds.includes(destId)) {
    return NextResponse.json({ error: 'Seul le PDG ou le co-PDG de la compagnie destinataire peut accepter' }, { status: 403 });
  }

  if (action === 'refuser') {
    await admin.from('alliance_transferts_avions').update({ statut: 'refuse', traite_at: new Date().toISOString() }).eq('id', transfert_id);
    return NextResponse.json({ ok: true });
  }

  if (t.type_transfert === 'vente' && t.prix && t.prix > 0) {
    const { data: compteDest } = await admin.from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', destId)
      .eq('type', 'entreprise')
      .single();
    if (!compteDest) return NextResponse.json({ error: 'Compte compagnie acheteur introuvable' }, { status: 400 });

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compteDest.id,
      p_montant: t.prix,
    });
    if (!debitOk) return NextResponse.json({ error: 'Fonds insuffisants' }, { status: 400 });

    await admin.from('felitz_transactions').insert({
      compte_id: compteDest.id,
      type: 'debit',
      montant: t.prix,
      libelle: 'Achat avion alliance',
    });

    const { data: compteSource } = await admin.from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', t.compagnie_source_id)
      .eq('type', 'entreprise')
      .single();
    if (compteSource) {
      await admin.rpc('crediter_compte_safe', {
        p_compte_id: compteSource.id,
        p_montant: t.prix,
      });
      await admin.from('felitz_transactions').insert({
        compte_id: compteSource.id,
        type: 'credit',
        montant: t.prix,
        libelle: 'Vente avion alliance',
      });
    }
  }

  await admin.from('compagnie_avions').update({ compagnie_id: destId }).eq('id', t.compagnie_avion_id);
  await admin.from('alliance_transferts_avions').update({ statut: 'complete', compagnie_dest_id: destId, traite_at: new Date().toISOString() }).eq('id', transfert_id);

  // Annuler les annonces Hangar Market pour cet avion (même avion vendu ailleurs)
  await admin.from('hangar_market')
    .update({ statut: 'annulé' })
    .eq('compagnie_avion_id', t.compagnie_avion_id)
    .eq('statut', 'en_vente');

  return NextResponse.json({ ok: true });
}
