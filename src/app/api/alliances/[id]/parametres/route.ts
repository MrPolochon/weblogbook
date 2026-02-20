import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** PATCH: mettre à jour les paramètres (dirigeant uniquement) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: pdgCompagnies } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const myCompagnieIds = (pdgCompagnies || []).map((c) => c.id);
  const { data: dir } = await admin.from('alliance_membres').select('id').eq('alliance_id', allianceId).in('compagnie_id', myCompagnieIds).eq('role', 'dirigeant').limit(1).single();
  if (!dir) return NextResponse.json({ error: 'Seuls les dirigeants peuvent modifier les paramètres' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const allowed = [
    'actif_vente_avions_entre_membres', 'actif_don_avions', 'actif_pret_avions', 'actif_avions_membres',
    'actif_codeshare', 'actif_compte_alliance', 'actif_taxes_alliance',
    'codeshare_pourcent', 'taxe_alliance_pourcent',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (Object.keys(updates).length <= 1) return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });

  const { error } = await admin.from('alliance_parametres').update(updates).eq('alliance_id', allianceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
