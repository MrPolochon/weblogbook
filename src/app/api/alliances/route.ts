import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET: liste des alliances où mes compagnies sont membres */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const compagnieIds: string[] = [];
  const { data: pdgRows } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  (pdgRows || []).forEach((r) => compagnieIds.push(r.id));
  const { data: empRows } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id);
  (empRows || []).forEach((r) => { if (r.compagnie_id && !compagnieIds.includes(r.compagnie_id)) compagnieIds.push(r.compagnie_id); });

  if (compagnieIds.length === 0) return NextResponse.json([]);

  const { data: membres } = await admin.from('alliance_membres')
    .select('alliance_id, role, compagnie_id')
    .in('compagnie_id', compagnieIds);

  if (!membres?.length) return NextResponse.json([]);

  const allianceIds = Array.from(new Set(membres.map((m) => m.alliance_id)));
  const { data: alliances } = await admin.from('alliances')
    .select('id, nom, created_at, created_by_compagnie_id')
    .in('id', allianceIds);

  const { data: params } = await admin.from('alliance_parametres').select('*').in('alliance_id', allianceIds);
  const paramsByAlliance = (params || []).reduce((acc, p) => ({ ...acc, [p.alliance_id]: p }), {} as Record<string, typeof params[0]>);

  const result = (alliances || []).map((a) => {
    const ms = membres.filter((m) => m.alliance_id === a.id);
    const myMembership = ms.find((m) => compagnieIds.includes(m.compagnie_id));
    return {
      id: a.id,
      nom: a.nom,
      created_at: a.created_at,
      created_by_compagnie_id: a.created_by_compagnie_id,
      parametres: paramsByAlliance[a.id] || null,
      my_compagnie_id: myMembership?.compagnie_id ?? null,
      my_role: myMembership?.role ?? null,
    };
  });
  return NextResponse.json(result);
}

/** POST: créer une alliance (PDG uniquement, sa compagnie devient dirigeant) */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { nom, compagnie_id } = body;
  if (!nom || !compagnie_id) return NextResponse.json({ error: 'nom et compagnie_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: compagnie } = await admin.from('compagnies').select('id, pdg_id').eq('id', compagnie_id).single();
  if (!compagnie || compagnie.pdg_id !== user.id) return NextResponse.json({ error: 'Seul le PDG de cette compagnie peut créer une alliance' }, { status: 403 });

  const { data: already } = await admin.from('alliance_membres').select('id').eq('compagnie_id', compagnie_id).limit(1);
  if (already?.length) return NextResponse.json({ error: 'Cette compagnie fait déjà partie d\'une alliance' }, { status: 400 });

  const { data: id, error } = await admin.rpc('alliance_creer', { p_nom: String(nom).trim(), p_compagnie_id: compagnie_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id });
}
