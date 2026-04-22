import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';
import { dedupeAllianceMembresByCompagnie, findPresidentMembership, pickHighestAllianceRoleMembership } from '@/lib/alliance-membres';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const leaderCompIds = await getLeaderCompagnieIds(user.id, admin);
  const compagnieIds: string[] = [...leaderCompIds];
  const { data: emp } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id);
  (emp || []).forEach(r => { if (r.compagnie_id && !compagnieIds.includes(r.compagnie_id)) compagnieIds.push(r.compagnie_id); });

  const { data: alliance } = await admin.from('alliances').select('*').eq('id', id).single();
  if (!alliance) return NextResponse.json({ error: 'Alliance introuvable' }, { status: 404 });

  const { data: myMembers } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', id)
    .in('compagnie_id', compagnieIds);

  const isAdmin = (await admin.from('profiles').select('role').eq('id', user.id).single()).data?.role === 'admin';
  if ((!myMembers || myMembers.length === 0) && !isAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const pdgCompagnieIds = leaderCompIds;
  const myMember = pickHighestAllianceRoleMembership(myMembers);
  const myAllCompagnieIds = (myMembers || []).map(m => m.compagnie_id);
  const myCompagnieIds = myAllCompagnieIds.filter(cid => pdgCompagnieIds.includes(cid));
  const myRole = myMember?.role ?? (isAdmin ? 'admin' : null);

  // codeshare_pourcent might not exist yet (migration pending)
  const { data: rawMembres, error: membresErr } = await admin.from('alliance_membres')
    .select('id, compagnie_id, role, joined_at, codeshare_pourcent, compagnies(id, nom)')
    .eq('alliance_id', id);

  let membresData: Record<string, unknown>[] | null = rawMembres as Record<string, unknown>[] | null;
  if (membresErr) {
    const { data: fallback } = await admin.from('alliance_membres')
      .select('id, compagnie_id, role, joined_at, compagnies(id, nom)')
      .eq('alliance_id', id);
    membresData = fallback as Record<string, unknown>[] | null;
  }

  const membres = dedupeAllianceMembresByCompagnie((membresData || []).map(m => {
    const raw = (m as Record<string, unknown>).compagnies as unknown;
    const comp = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: m.id as string,
      compagnie_id: m.compagnie_id as string,
      role: m.role as string,
      joined_at: m.joined_at as string,
      codeshare_pourcent: Number((m as Record<string, unknown>).codeshare_pourcent ?? 0),
      compagnie: (comp || null) as { id: string; nom: string } | null,
    };
  }));

  const { data: parametres } = await admin.from('alliance_parametres').select('*').eq('alliance_id', id).single();

  let compte = null;
  let transactions_alliance: Array<{ id: string; type: string; montant: number; libelle: string | null; created_at: string }> = [];
  if (myRole === 'president' || myRole === 'vice_president' || myRole === 'admin') {
    const { data: fc } = await admin.from('felitz_comptes').select('id, vban, solde').eq('alliance_id', id).eq('type', 'alliance').single();
    compte = fc;
    if (fc) {
      const { data: tx } = await admin.from('felitz_transactions')
        .select('id, type, montant, libelle, created_at')
        .eq('compte_id', fc.id)
        .order('created_at', { ascending: false })
        .limit(50);
      const raw = tx || [];
      const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const toResolve = new Set<string>();
      raw.forEach((t: { libelle?: string | null }) => {
        (t.libelle || '').match(UUID_REGEX)?.forEach(u => toResolve.add(u));
      });
      const vbanByUuid: Record<string, string> = {};
      if (toResolve.size > 0) {
        const ids = Array.from(toResolve);
        const { data: byId } = await admin.from('felitz_comptes').select('id, vban').in('id', ids);
        (byId || []).forEach((r: Record<string, string>) => { if (r.id) vbanByUuid[r.id] = r.vban; });
        const cols = ['compagnie_id', 'proprietaire_id', 'alliance_id', 'entreprise_reparation_id'] as const;
        for (const col of cols) {
          const { data: rows } = await admin.from('felitz_comptes').select(`${col}, vban`).in(col, ids);
          (rows || []).forEach((r: Record<string, string>) => { if (r[col]) vbanByUuid[r[col]] = r.vban; });
        }
      }
      transactions_alliance = raw.map((t: { id: string; type: string; montant: number; libelle?: string | null; created_at: string }) => {
        let libelle = t.libelle || '';
        for (const [uuid, vban] of Object.entries(vbanByUuid)) {
          const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          libelle = libelle.replace(new RegExp(escaped, 'gi'), vban);
        }
        return { id: t.id, type: t.type, montant: t.montant, libelle, created_at: t.created_at };
      });
    }
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

  const { data: transfertsRaw } = await admin.from('alliance_transferts_avions')
    .select('*')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  const avionIds = Array.from(new Set((transfertsRaw || []).map((t: { compagnie_avion_id?: string }) => t.compagnie_avion_id).filter(Boolean) as string[]));
  let avionsMap: Record<string, { immatriculation?: string; nom_bapteme?: string | null; type_nom?: string }> = {};
  if (avionIds.length > 0) {
    const { data: avions } = await admin.from('compagnie_avions')
      .select('id, immatriculation, nom_bapteme, type_avion_id, types_avion:type_avion_id(nom, code_oaci)')
      .in('id', avionIds);
    avionsMap = {};
    (avions || []).forEach((a: Record<string, unknown>) => {
      const typeAv = a.types_avion as { nom?: string; code_oaci?: string } | { nom?: string; code_oaci?: string }[] | null;
      const typeNom = typeAv ? (Array.isArray(typeAv) ? typeAv[0]?.nom || typeAv[0]?.code_oaci : typeAv.nom || typeAv.code_oaci) : null;
      avionsMap[a.id as string] = { immatriculation: a.immatriculation as string, nom_bapteme: a.nom_bapteme as string | null, type_nom: typeNom as string };
    });
  }

  const transferts = (transfertsRaw || []).map((t: Record<string, unknown>) => {
    const av = avionsMap[t.compagnie_avion_id as string];
    const avionLabel = av ? `${av.immatriculation || '?'} — ${av.type_nom || '?'}` : null;
    return { ...t, avion_label: avionLabel, avion_immat: av?.immatriculation, avion_type: av?.type_nom };
  });

  const { data: demandes_fonds } = await admin.from('alliance_demandes_fonds')
    .select('*')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  let contributions: Array<Record<string, unknown> & { compagnie_nom?: string | null }>;
  const { data: contributionsRaw, error: contribErr } = await admin.from('alliance_contributions')
    .select('*, compagnies(id, nom)')
    .eq('alliance_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (contribErr || !contributionsRaw) {
    const { data: contribFallback } = await admin.from('alliance_contributions')
      .select('*')
      .eq('alliance_id', id)
      .order('created_at', { ascending: false })
      .limit(30);
    contributions = (contribFallback || []).map(c => ({ ...c, compagnie_nom: null }));
  } else {
    contributions = contributionsRaw.map((c: Record<string, unknown>) => {
      const raw = c.compagnies as unknown;
      const comp = Array.isArray(raw) ? raw[0] : raw;
      const { compagnies: _r, ...rest } = c;
      return { ...rest, compagnie_nom: (comp as { nom?: string })?.nom ?? null };
    });
  }

  return NextResponse.json({
    ...alliance,
    parametres: parametres || null,
    membres,
    compte_alliance: compte,
    annonces: annonces || [],
    invitations_en_attente: invitationsNorm,
    transferts: transferts || [],
    demandes_fonds: demandes_fonds || [],
    contributions,
    transactions_alliance: transactions_alliance || [],
    my_role: myRole,
    my_compagnie_id: myMember?.compagnie_id ?? null,
    my_compagnie_ids: myCompagnieIds,
    my_all_compagnie_ids: myAllCompagnieIds,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const myLeaderIds = await getLeaderCompagnieIds(user.id, admin);
  const { data: myMembersMeta } = myLeaderIds.length === 0
    ? { data: null as { role: string; compagnie_id: string }[] | null }
    : await admin.from('alliance_membres')
        .select('role, compagnie_id')
        .eq('alliance_id', id)
        .in('compagnie_id', myLeaderIds);

  if (!myMembersMeta?.some(m => ['president', 'vice_president'].includes(m.role))) {
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
  const myLeaderIds = await getLeaderCompagnieIds(user.id, admin);
  const { data: myMembersDel } = myLeaderIds.length === 0
    ? { data: null as { role: string; compagnie_id: string }[] | null }
    : await admin.from('alliance_membres')
        .select('role, compagnie_id')
        .eq('alliance_id', id)
        .in('compagnie_id', myLeaderIds);

  const isAdmin = (await admin.from('profiles').select('role').eq('id', user.id).single()).data?.role === 'admin';
  if (!findPresidentMembership(myMembersDel ?? []) && !isAdmin) {
    return NextResponse.json({ error: 'Seul le président peut dissoudre l\'alliance' }, { status: 403 });
  }

  await admin.from('compagnies').update({ alliance_id: null }).eq('alliance_id', id);
  const { error } = await admin.from('alliances').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
