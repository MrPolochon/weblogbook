import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCoPdg } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

/** POST: quitter l'alliance (PDG de la compagnie) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { compagnie_id } = body;
  if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: compagnie } = await admin.from('compagnies').select('id, pdg_id').eq('id', compagnie_id).single();
  const canQuitter =
    !!compagnie &&
    (compagnie.pdg_id === user.id || (await isCoPdg(user.id, compagnie.id, admin)));
  if (!canQuitter) {
    return NextResponse.json({ error: 'Seul le PDG ou le co-PDG peut faire quitter la compagnie' }, { status: 403 });
  }

  const { data: mem } = await admin
    .from('alliance_membres')
    .select('id, alliance_id, role')
    .eq('compagnie_id', compagnie_id)
    .eq('alliance_id', allianceId)
    .single();
  if (!mem) return NextResponse.json({ error: 'Cette compagnie n\'est pas dans cette alliance' }, { status: 400 });

  // Retrait du membre et mise à null de l'alliance sur la compagnie
  await admin.from('alliance_membres').delete().eq('id', mem.id);
  await admin.from('compagnies').update({ alliance_id: null }).eq('id', compagnie_id);

  // Compter les membres restants
  const { count: restants } = await admin
    .from('alliance_membres')
    .select('*', { count: 'exact', head: true })
    .eq('alliance_id', allianceId);

  if ((restants ?? 0) === 0) {
    // Plus personne : supprimer l'alliance
    await admin.from('alliances').delete().eq('id', allianceId);
  } else if (mem.role === 'president') {
    // Le président part : promouvoir le membre le plus ancien
    const { data: plusAncien } = await admin
      .from('alliance_membres')
      .select('id')
      .eq('alliance_id', allianceId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();
    if (plusAncien) {
      await admin.from('alliance_membres').update({ role: 'president' }).eq('id', plusAncien.id);
    }
  }

  return NextResponse.json({ ok: true });
}
