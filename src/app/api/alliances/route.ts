import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function getUserCompagnies(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string[]> {
  const ids: string[] = [];
  const { data: pdg } = await admin.from('compagnies').select('id').eq('pdg_id', userId);
  (pdg || []).forEach(r => ids.push(r.id));
  const { data: emp } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', userId);
  (emp || []).forEach(r => { if (r.compagnie_id && !ids.includes(r.compagnie_id)) ids.push(r.compagnie_id); });
  return ids;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const listAll = searchParams.get('list') === '1';

  if (listAll) {
    const { data: alliances } = await admin.from('alliances').select('id, nom').order('nom');
    return NextResponse.json(alliances || []);
  }

  const compagnieIds = await getUserCompagnies(admin, user.id);
  if (compagnieIds.length === 0) return NextResponse.json([]);

  const { data: membres } = await admin.from('alliance_membres')
    .select('alliance_id, role, compagnie_id')
    .in('compagnie_id', compagnieIds);
  if (!membres?.length) return NextResponse.json([]);

  const allianceIds = Array.from(new Set(membres.map(m => m.alliance_id)));
  const { data: alliances } = await admin.from('alliances')
    .select('id, nom, description, logo_url, devise, created_at, created_by_compagnie_id')
    .in('id', allianceIds);

  const { data: params } = await admin.from('alliance_parametres').select('*').in('alliance_id', allianceIds);
  const paramMap = Object.fromEntries((params || []).map(p => [p.alliance_id, p]));

  const { data: allMembres } = await admin.from('alliance_membres')
    .select('alliance_id')
    .in('alliance_id', allianceIds);
  const countMap: Record<string, number> = {};
  (allMembres || []).forEach(m => { countMap[m.alliance_id] = (countMap[m.alliance_id] || 0) + 1; });

  const compagnieIdsForNames = Array.from(new Set(membres.map(m => m.compagnie_id)));
  const { data: compagniesData } = await admin.from('compagnies').select('id, nom').in('id', compagnieIdsForNames);
  const compNomMap = Object.fromEntries((compagniesData || []).map(c => [c.id, c.nom]));

  return NextResponse.json((alliances || []).map(a => {
    const myMemberships = membres.filter(m => m.alliance_id === a.id && compagnieIds.includes(m.compagnie_id));
    const myCompagnieIds = myMemberships.map(m => m.compagnie_id);
    const myCompagnieNoms = myCompagnieIds.map(id => compNomMap[id] ?? id);
    const firstMembership = myMemberships[0] ?? null;
    return {
      ...a,
      parametres: paramMap[a.id] || null,
      nb_membres: countMap[a.id] || 0,
      my_compagnie_id: firstMembership?.compagnie_id ?? null,
      my_compagnie_nom: firstMembership?.compagnie_id ? (compNomMap[firstMembership.compagnie_id] ?? null) : null,
      my_compagnie_ids: myCompagnieIds,
      my_compagnie_noms: myCompagnieNoms,
      my_role: firstMembership?.role ?? null,
    };
  }));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { nom, compagnie_id, description, devise } = body;
  if (!nom || !compagnie_id) return NextResponse.json({ error: 'nom et compagnie_id requis' }, { status: 400 });
  if (String(nom).trim().length < 2) return NextResponse.json({ error: 'Nom trop court (min 2 caractères)' }, { status: 400 });

  const { data: compagnie } = await admin.from('compagnies').select('id, pdg_id').eq('id', compagnie_id).single();
  if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

  const { data: already } = await admin.from('alliance_membres').select('id').eq('compagnie_id', compagnie_id).limit(1);
  if (already?.length) return NextResponse.json({ error: 'Cette compagnie fait déjà partie d\'une alliance' }, { status: 400 });

  const { data: id, error } = await admin.rpc('alliance_creer', { p_nom: String(nom).trim(), p_compagnie_id: compagnie_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (description || devise) {
    await admin.from('alliances').update({
      ...(description ? { description: String(description).trim() } : {}),
      ...(devise ? { devise: String(devise).trim() } : {}),
    }).eq('id', id);
  }

  return NextResponse.json({ id });
}
