import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET: liste des membres (déjà fait dans GET alliance) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const compagnieIds: string[] = [];
  const { data: pdgRows } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  (pdgRows || []).forEach((r) => compagnieIds.push(r.id));
  const { data: empRows } = await admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id);
  (empRows || []).forEach((r) => { if (r.compagnie_id && !compagnieIds.includes(r.compagnie_id)) compagnieIds.push(r.compagnie_id); });

  const { data: myMember } = await admin.from('alliance_membres').select('id').eq('alliance_id', id).in('compagnie_id', compagnieIds).limit(1).single();
  if (!myMember) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const { data: membres } = await admin.from('alliance_membres')
    .select('id, compagnie_id, role, joined_at, compagnies(id, nom)')
    .eq('alliance_id', id);
  return NextResponse.json(membres || []);
}

/** POST: ajouter une compagnie (dirigeant uniquement). body: { compagnie_id, role: 'dirigeant'|'membre' } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { compagnie_id, role } = body;
  if (!compagnie_id || !role || !['dirigeant', 'membre'].includes(role)) return NextResponse.json({ error: 'compagnie_id et role (dirigeant|membre) requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: pdgCompagnies } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const myCompagnieIds = (pdgCompagnies || []).map((c) => c.id);
  const { data: dir } = await admin.from('alliance_membres').select('id').eq('alliance_id', allianceId).in('compagnie_id', myCompagnieIds).eq('role', 'dirigeant').limit(1).single();
  if (!dir) return NextResponse.json({ error: 'Seuls les dirigeants peuvent ajouter des membres' }, { status: 403 });

  const { data: existing } = await admin.from('alliance_membres').select('id').eq('compagnie_id', compagnie_id).limit(1);
  if (existing?.length) return NextResponse.json({ error: 'Cette compagnie est déjà dans une alliance' }, { status: 400 });

  const { data: comp } = await admin.from('compagnies').select('id').eq('id', compagnie_id).single();
  if (!comp) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

  const { error } = await admin.from('alliance_membres').insert({
    alliance_id: allianceId,
    compagnie_id,
    role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from('compagnies').update({ alliance_id: allianceId }).eq('id', compagnie_id);
  return NextResponse.json({ ok: true });
}
