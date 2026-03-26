import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (!myMember || !['president', 'vice_president'].includes(myMember.role)) {
    return NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = [
    'codeshare_actif', 'codeshare_pourcent', 'taxe_alliance_actif', 'taxe_alliance_pourcent',
    'transfert_avions_actif', 'pret_avions_actif', 'don_avions_actif', 'partage_hubs_actif',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { error } = await admin.from('alliance_parametres').update(updates).eq('alliance_id', allianceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
