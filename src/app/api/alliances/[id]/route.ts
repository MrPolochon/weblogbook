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
  const compagnieIds: string[] = [];
  const { data: pdg } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  (pdg || []).forEach(r => compagnieIds.push(r.id));
  const { data: emp } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id);
  (emp || []).forEach(r => { if (r.compagnie_id && !compagnieIds.includes(r.compagnie_id)) compagnieIds.push(r.compagnie_id); });

  const { data: alliance } = await admin.from('alliances').select('*').eq('id', id).single();
  if (!alliance) return NextResponse.json({ error: 'Alliance introuvable' }, { status: 404 });

  const { data: myMember } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', id)
    .in('compagnie_id', compagnieIds)
    .limit(1).single();

  const isAdmin = (await admin.from('profiles').select('role').eq('id', user.id).single()).data?.role === 'admin';
  if (!myMember && !isAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const myRole = myMember?.role ?? (isAdmin ? 'admin' : null);

  // codeshare_pourcent might not exist yet (migration pending)
  const { data: rawMembres, error: membresErr } = await admin.from('alliance_membres')
    .select('id, compagnie_id, role, joined_at, codeshare_pourcent, compagnies(id, nom)')
    .eq('alliance_id', id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let membresData: any[] | null = rawMembres;
  if (membresErr) {
    const { data: fallback } = await admin.from('alliance_membres')
      .select('id, compagnie_id, role, joined_at, compagnies(id, nom)')
      .eq('alliance_id', id);
    membresData = fallback;
  }

  const membres = (membresData || []).map(m => {
    const raw = (m as Record<string, unknown>).compagnies as unknown;
    const comp = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: m.id,
      compagnie_id: m.compagnie_id,
      role: m.role,
      joined_at: m.joined_at,
      codeshare_pourcent: Number((m as Record<string, unknown>).codeshare_pourcent ?? 0),
      compagnie: (comp || null) as { id: string; nom: string } | null,
    };
  });

  const { data: parametres } = await admin.from('alliance_parametres').select('*').eq('alliance_id', id).single();

  let compte = null;
  if (myRole === 'president' || myRole === 'vice_president' || myRole === 'admin') {
    const { data: fc } = await admin.from('felitz_comptes').select('id, vban, solde').eq('alliance_id', id).eq('type', 'alliance').single();
    compte = fc;
  }

  const { data: annonces } = await admin.from('alliance_annonces')
    .select('id, titre, contenu, important, created_at, auteur_id')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: invitations } = await admin.from('alliance_invitations')
    .select('id, compagnie_id, invite_par_id, statut, message, created_at, compagnies(id, nom)')
    .eq('alliance_id', id)
    .eq('statut', 'en_attente');

  const invitationsNorm = (invitations || []).map(inv => {
    const raw = inv.compagnies as unknown;
    const comp = Array.isArray(raw) ? raw[0] : raw;
    return { ...inv, compagnie: comp || null };
  });

  const { data: transferts } = await admin.from('alliance_transferts_avions')
    .select('*')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: demandes_fonds } = await admin.from('alliance_demandes_fonds')
    .select('*')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: contributions } = await admin.from('alliance_contributions')
    .select('*')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  return NextResponse.json({
    ...alliance,
    parametres: parametres || null,
    membres,
    compte_alliance: compte,
    annonces: annonces || [],
    invitations_en_attente: invitationsNorm,
    transferts: transferts || [],
    demandes_fonds: demandes_fonds || [],
    contributions: contributions || [],
    my_role: myRole,
    my_compagnie_id: myMember?.compagnie_id ?? null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', id)
    .in('compagnie_id', (await admin.from('compagnies').select('id').eq('pdg_id', user.id)).data?.map(c => c.id) || [])
    .limit(1).single();

  if (!myMember || !['president', 'vice_president'].includes(myMember.role)) {
    return NextResponse.json({ error: 'Seul le président ou VP peut modifier l\'alliance' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.nom !== undefined) updates.nom = String(body.nom).trim();
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null;
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url || null;
  if (body.devise !== undefined) updates.devise = body.devise ? String(body.devise).trim() : null;

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 });

  const { error } = await admin.from('alliances').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', id)
    .in('compagnie_id', (await admin.from('compagnies').select('id').eq('pdg_id', user.id)).data?.map(c => c.id) || [])
    .limit(1).single();

  const isAdmin = (await admin.from('profiles').select('role').eq('id', user.id).single()).data?.role === 'admin';
  if ((!myMember || myMember.role !== 'president') && !isAdmin) {
    return NextResponse.json({ error: 'Seul le président peut dissoudre l\'alliance' }, { status: 403 });
  }

  await admin.from('compagnies').update({ alliance_id: null }).eq('alliance_id', id);
  const { error } = await admin.from('alliances').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
