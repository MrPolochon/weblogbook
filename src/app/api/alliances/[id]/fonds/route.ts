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
  const { action } = body;

  if (action === 'demande_fonds') {
    const { montant, motif, compagnie_id: bodyCompagnieId } = body;
    if (!montant || montant <= 0 || !motif) return NextResponse.json({ error: 'montant et motif requis' }, { status: 400 });

    const demandeCompagnieId = bodyCompagnieId && myCompIds.includes(bodyCompagnieId)
      ? bodyCompagnieId
      : myMember.compagnie_id;

    const { data: membreDemande } = await admin.from('alliance_membres')
      .select('id')
      .eq('alliance_id', allianceId)
      .eq('compagnie_id', demandeCompagnieId)
      .single();
    if (!membreDemande) return NextResponse.json({ error: 'Cette compagnie n\'est pas membre de l\'alliance' }, { status: 400 });

    const { error } = await admin.from('alliance_demandes_fonds').insert({
      alliance_id: allianceId,
      compagnie_id: demandeCompagnieId,
      montant: Math.floor(montant),
      motif: String(motif).trim(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: 'Demande de fonds soumise' });
  }

  if (action === 'contribuer') {
    const { montant, libelle, source, compagnie_id: bodyCompagnieId } = body;
    if (!montant || montant <= 0) return NextResponse.json({ error: 'montant requis' }, { status: 400 });
    const amt = Math.floor(montant);
    const isPersonnel = source === 'personnel';
    const contribCompagnieId = !isPersonnel && bodyCompagnieId && myCompIds.includes(bodyCompagnieId)
      ? bodyCompagnieId
      : myMember.compagnie_id;

    let vbanSource = '';

    if (isPersonnel) {
      const { data: comptePerso } = await admin.from('felitz_comptes')
        .select('id, solde, vban')
        .eq('proprietaire_id', user.id)
        .eq('type', 'personnel')
        .single();
      if (!comptePerso) return NextResponse.json({ error: 'Compte personnel introuvable' }, { status: 400 });
      if (comptePerso.solde < amt) return NextResponse.json({ error: 'Fonds personnels insuffisants' }, { status: 400 });
      vbanSource = comptePerso.vban || '';

      const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
        p_compte_id: comptePerso.id,
        p_montant: amt,
      });
      if (!debitOk) return NextResponse.json({ error: 'Fonds personnels insuffisants' }, { status: 400 });

      await admin.from('felitz_transactions').insert({
        compte_id: comptePerso.id,
        type: 'debit',
        montant: amt,
        libelle: `Contribution alliance (perso)`,
      });
    } else {
      const { data: compteComp } = await admin.from('felitz_comptes')
        .select('id, solde, vban')
        .eq('compagnie_id', contribCompagnieId)
        .eq('type', 'entreprise')
        .single();
      if (!compteComp) return NextResponse.json({ error: 'Compte compagnie introuvable' }, { status: 400 });
      if (compteComp.solde < amt) return NextResponse.json({ error: 'Fonds compagnie insuffisants' }, { status: 400 });
      vbanSource = compteComp.vban || '';

      const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
        p_compte_id: compteComp.id,
        p_montant: amt,
      });
      if (!debitOk) return NextResponse.json({ error: 'Fonds compagnie insuffisants' }, { status: 400 });

      await admin.from('felitz_transactions').insert({
        compte_id: compteComp.id,
        type: 'debit',
        montant: amt,
        libelle: `Contribution alliance`,
      });
    }
    const { data: allianceAccount } = await admin.from('felitz_comptes').select('id').eq('alliance_id', allianceId).eq('type', 'alliance').single();
    if (allianceAccount) {
      await admin.rpc('crediter_compte_safe', { p_compte_id: allianceAccount.id, p_montant: amt });
      await admin.from('felitz_transactions').insert({
        compte_id: allianceAccount.id,
        type: 'credit',
        montant: amt,
        libelle: `Contribution${isPersonnel ? ' (personnel)' : ''} — ${vbanSource}`,
      });
    }

    await admin.from('alliance_contributions').insert({
      alliance_id: allianceId,
      compagnie_id: contribCompagnieId,
      montant: amt,
      libelle: (libelle ? String(libelle).trim() : 'Contribution') + (isPersonnel ? ' (personnel)' : '') + ` — ${vbanSource}`,
    });

    return NextResponse.json({ ok: true, message: `${amt.toLocaleString('fr-FR')} F$ contribués` });
  }

  return NextResponse.json({ error: 'Action invalide (demande_fonds ou contribuer)' }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myComps } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', (myComps || []).map(c => c.id))
    .limit(1).single();

  if (!myMember || !['president', 'vice_president'].includes(myMember.role)) {
    return NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { demande_id, decision } = body;
  if (!demande_id || !['accepter', 'refuser'].includes(decision)) {
    return NextResponse.json({ error: 'demande_id et decision requis' }, { status: 400 });
  }

  const { data: demande } = await admin.from('alliance_demandes_fonds')
    .select('*').eq('id', demande_id).eq('alliance_id', allianceId).single();
  if (!demande || demande.statut !== 'en_attente') return NextResponse.json({ error: 'Demande introuvable ou déjà traitée' }, { status: 404 });

  if (decision === 'refuser') {
    await admin.from('alliance_demandes_fonds').update({
      statut: 'refusee', traite_par: user.id, traite_at: new Date().toISOString(),
    }).eq('id', demande_id);
    return NextResponse.json({ ok: true });
  }

  const { data: allianceAccount } = await admin.from('felitz_comptes')
    .select('id, vban').eq('alliance_id', allianceId).eq('type', 'alliance').single();
  if (!allianceAccount) return NextResponse.json({ error: 'Compte alliance introuvable' }, { status: 400 });

  const allianceVban = allianceAccount.vban || '';

  const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
    p_compte_id: allianceAccount.id,
    p_montant: demande.montant,
  });
  if (!debitOk) return NextResponse.json({ error: 'Fonds alliance insuffisants' }, { status: 400 });

  const { data: compteDestComp } = await admin.from('felitz_comptes')
    .select('id, vban')
    .eq('compagnie_id', demande.compagnie_id)
    .eq('type', 'entreprise')
    .single();

  const destVban = compteDestComp?.vban || '?';

  await admin.from('felitz_transactions').insert({
    compte_id: allianceAccount.id,
    type: 'debit',
    montant: demande.montant,
    libelle: `Demande fonds — vers ${destVban} : ${demande.motif}`,
  });

  if (compteDestComp) {
    await admin.rpc('crediter_compte_safe', {
      p_compte_id: compteDestComp.id,
      p_montant: demande.montant,
    });
    await admin.from('felitz_transactions').insert({
      compte_id: compteDestComp.id,
      type: 'credit',
      montant: demande.montant,
      libelle: `Fonds alliance — de ${allianceVban} : ${demande.motif}`,
    });
  }

  await admin.from('alliance_demandes_fonds').update({
    statut: 'acceptee', traite_par: user.id, traite_at: new Date().toISOString(),
  }).eq('id', demande_id);

  const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', demande.compagnie_id).single();
  if (comp) {
    await admin.from('messages').insert({
      destinataire_id: comp.pdg_id,
      titre: `💰 Fonds alliance approuvés`,
      contenu: `Votre demande de ${demande.montant.toLocaleString('fr-FR')} F$ a été approuvée.\nMotif : ${demande.motif}`,
      type_message: 'normal',
    });
  }

  return NextResponse.json({ ok: true });
}
