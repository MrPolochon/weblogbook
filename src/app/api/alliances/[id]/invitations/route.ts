import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds, isCoPdg } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const myCompIds = await getLeaderCompagnieIds(user.id, admin);
  if (myCompIds.length === 0) {
    return NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
  }
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', myCompIds)
    .limit(1).single();

  if (!myMember || !['president', 'vice_president', 'secretaire'].includes(myMember.role)) {
    return NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { compagnie_id, message } = body;
  if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

  const { data: target } = await admin.from('compagnies').select('id, nom, pdg_id, alliance_id').eq('id', compagnie_id).single();
  if (!target) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
  if (target.alliance_id) return NextResponse.json({ error: 'Cette compagnie est déjà dans une alliance' }, { status: 400 });

  const { data: existing } = await admin.from('alliance_invitations')
    .select('id').eq('alliance_id', allianceId).eq('compagnie_id', compagnie_id).eq('statut', 'en_attente').limit(1);
  if (existing?.length) return NextResponse.json({ error: 'Invitation déjà envoyée' }, { status: 409 });

  const { error } = await admin.from('alliance_invitations').insert({
    alliance_id: allianceId,
    compagnie_id,
    invite_par_id: user.id,
    message: message ? String(message).trim() : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: alliance } = await admin.from('alliances').select('nom').eq('id', allianceId).single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  await admin.from('messages').insert({
    destinataire_id: target.pdg_id,
    titre: `📨 Invitation alliance — ${alliance?.nom || 'Alliance'}`,
    contenu: `Votre compagnie "${target.nom}" a été invitée à rejoindre l'alliance "${alliance?.nom}".${message ? `\n\nMessage : ${message}` : ''}\n\n👉 Pour accepter ou refuser, rendez-vous sur la page Alliance : ${appUrl}/alliance\n\nVous y trouverez un encadré "Invitations en attente" avec les boutons Accepter / Refuser.`,
    type_message: 'normal',
  });

  return NextResponse.json({ ok: true, message: 'Invitation envoyée' });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { invitation_id, action } = body;
  if (!invitation_id || !['accepter', 'refuser'].includes(action)) {
    return NextResponse.json({ error: 'invitation_id et action (accepter/refuser) requis' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inv } = await admin.from('alliance_invitations')
    .select('id, alliance_id, compagnie_id, statut')
    .eq('id', invitation_id).eq('alliance_id', allianceId).single();
  if (!inv || inv.statut !== 'en_attente') return NextResponse.json({ error: 'Invitation introuvable ou déjà traitée' }, { status: 404 });

  const { data: comp } = await admin.from('compagnies').select('id, pdg_id').eq('id', inv.compagnie_id).single();
  const canRespond =
    !!comp &&
    (comp.pdg_id === user.id || (await isCoPdg(user.id, comp.id, admin)));
  if (!canRespond) return NextResponse.json({ error: 'Seul le PDG ou le co-PDG peut répondre' }, { status: 403 });

  if (action === 'refuser') {
    await admin.from('alliance_invitations').update({ statut: 'refusee', traite_at: new Date().toISOString() }).eq('id', invitation_id);
    return NextResponse.json({ ok: true, message: 'Invitation refusée' });
  }

  const { data: existingMember } = await admin.from('alliance_membres').select('id').eq('compagnie_id', inv.compagnie_id).limit(1);
  if (existingMember?.length) return NextResponse.json({ error: 'Déjà dans une alliance' }, { status: 400 });

  await admin.from('alliance_invitations').update({ statut: 'acceptee', traite_at: new Date().toISOString() }).eq('id', invitation_id);
  await admin.from('alliance_membres').insert({
    alliance_id: allianceId,
    compagnie_id: inv.compagnie_id,
    role: 'membre',
    invited_by: user.id,
  });
  await admin.from('compagnies').update({ alliance_id: allianceId }).eq('id', inv.compagnie_id);

  return NextResponse.json({ ok: true, message: 'Invitation acceptée' });
}
