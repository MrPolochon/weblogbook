import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myComps } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const myCompIds = (myComps || []).map(c => c.id);
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', myCompIds)
    .limit(1).single();
  if (!myMember) return NextResponse.json({ error: 'Pas membre' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { type_transfert, compagnie_avion_id, compagnie_dest_id, prix, duree_jours } = body;
  if (!type_transfert || !compagnie_avion_id || !compagnie_dest_id) {
    return NextResponse.json({ error: 'type_transfert, compagnie_avion_id et compagnie_dest_id requis' }, { status: 400 });
  }
  if (!['vente', 'don', 'pret'].includes(type_transfert)) return NextResponse.json({ error: 'Type invalide' }, { status: 400 });

  const { data: avion } = await admin.from('compagnie_avions').select('id, compagnie_id').eq('id', compagnie_avion_id).single();
  if (!avion || !myCompIds.includes(avion.compagnie_id)) return NextResponse.json({ error: 'Avion non trouvé ou pas à vous' }, { status: 404 });

  const { data: dest } = await admin.from('alliance_membres').select('id').eq('alliance_id', allianceId).eq('compagnie_id', compagnie_dest_id).single();
  if (!dest) return NextResponse.json({ error: 'Destination pas dans l\'alliance' }, { status: 400 });

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

  const { error } = await admin.from('alliance_transferts_avions').insert({
    alliance_id: allianceId,
    type_transfert,
    compagnie_avion_id,
    compagnie_source_id: avion.compagnie_id,
    compagnie_dest_id,
    prix: type_transfert === 'vente' ? (prix || 0) : null,
    duree_jours: type_transfert === 'pret' ? (duree_jours || 7) : null,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: destComp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', compagnie_dest_id).single();
  if (destComp) {
    await admin.from('messages').insert({
      destinataire_id: destComp.pdg_id,
      titre: `✈️ Proposition de ${type_transfert} d'avion`,
      contenu: `Un membre de l'alliance vous propose un ${type_transfert} d'avion. Consultez la section Alliance > Flotte.`,
      type_message: 'normal',
    });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myComps } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const myCompIds = (myComps || []).map(c => c.id);

  const body = await req.json().catch(() => ({}));
  const { transfert_id, action } = body;
  if (!transfert_id || !['accepter', 'refuser'].includes(action)) {
    return NextResponse.json({ error: 'transfert_id et action requis' }, { status: 400 });
  }

  const { data: t } = await admin.from('alliance_transferts_avions')
    .select('*')
    .eq('id', transfert_id).eq('alliance_id', allianceId).single();
  if (!t || t.statut !== 'en_attente') return NextResponse.json({ error: 'Transfert introuvable ou déjà traité' }, { status: 404 });

  if (!myCompIds.includes(t.compagnie_dest_id)) return NextResponse.json({ error: 'Seul le destinataire peut répondre' }, { status: 403 });

  if (action === 'refuser') {
    await admin.from('alliance_transferts_avions').update({ statut: 'refuse', traite_at: new Date().toISOString() }).eq('id', transfert_id);
    return NextResponse.json({ ok: true });
  }

  if (t.type_transfert === 'vente' && t.prix && t.prix > 0) {
    const { data: debit } = await admin.rpc('debiter_compte_safe', {
      p_compagnie_id: t.compagnie_dest_id,
      p_montant: t.prix,
      p_libelle: `Achat avion alliance`,
    });
    if (!debit?.success) return NextResponse.json({ error: debit?.error || 'Fonds insuffisants' }, { status: 400 });

    await admin.rpc('crediter_compte_safe', {
      p_compagnie_id: t.compagnie_source_id,
      p_montant: t.prix,
      p_libelle: `Vente avion alliance`,
    });
  }

  await admin.from('compagnie_avions').update({ compagnie_id: t.compagnie_dest_id }).eq('id', t.compagnie_avion_id);
  await admin.from('alliance_transferts_avions').update({ statut: 'complete', traite_at: new Date().toISOString() }).eq('id', transfert_id);

  return NextResponse.json({ ok: true });
}
