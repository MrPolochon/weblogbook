import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET: détail d'une alliance (si ma compagnie est membre) */
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

  const { data: alliance } = await admin.from('alliances').select('*').eq('id', id).single();
  if (!alliance) return NextResponse.json({ error: 'Alliance introuvable' }, { status: 404 });

  const { data: myMember } = await admin.from('alliance_membres').select('role, compagnie_id').eq('alliance_id', id).in('compagnie_id', compagnieIds).limit(1).single();
  if (!myMember) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const { data: membres } = await admin.from('alliance_membres')
    .select('id, compagnie_id, role, joined_at, compagnies(id, nom)')
    .eq('alliance_id', id);
  const { data: parametres } = await admin.from('alliance_parametres').select('*').eq('alliance_id', id).single();
  let compte = null;
  if (myMember.role === 'dirigeant') {
    const { data: fc } = await admin.from('felitz_comptes').select('id, vban, solde').eq('alliance_id', id).eq('type', 'alliance').single();
    compte = fc;
  }

  const rawMembres = (membres || []) as Array<{ id: string; compagnie_id: string; role: string; joined_at: string; compagnies?: { id: string; nom: string } | { id: string; nom: string }[] }>;
  const membresNorm = rawMembres.map((m) => {
    const comp = m.compagnies;
    const compagnie = comp ? (Array.isArray(comp) ? comp[0] : comp) : null;
    return { id: m.id, compagnie_id: m.compagnie_id, role: m.role, joined_at: m.joined_at, compagnie };
  });

  return NextResponse.json({
    ...alliance,
    parametres: parametres || null,
    membres: membresNorm,
    compte_alliance: compte,
    my_role: myMember.role,
    my_compagnie_id: myMember.compagnie_id,
  });
}
