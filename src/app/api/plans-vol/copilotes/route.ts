export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { STATUTS_PLAN_OCCUPES } from '@/lib/plans-vol/crew';

/**
 * GET /api/plans-vol/copilotes?compagnie_id=
 * Pilotes de la même compagnie (PDG + employés), hors soi-même, hors plan occupé.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const compagnieId = new URL(request.url).searchParams.get('compagnie_id');
    if (!compagnieId) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data: compagnie } = await admin.from('compagnies').select('id, pdg_id').eq('id', compagnieId).maybeSingle();
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: emplois } = await admin
      .from('compagnie_employes')
      .select('pilote_id')
      .eq('compagnie_id', compagnieId);

    const memberIds = new Set<string>();
    if (compagnie.pdg_id) memberIds.add(compagnie.pdg_id);
    for (const e of emplois ?? []) {
      if (e.pilote_id) memberIds.add(e.pilote_id);
    }
    if (!memberIds.has(user.id)) {
      return NextResponse.json({ error: 'Vous n’appartenez pas à cette compagnie.' }, { status: 403 });
    }

    memberIds.delete(user.id);
    const ids = [...memberIds];
    if (ids.length === 0) return NextResponse.json({ copilotes: [] });

    const [{ data: profiles }, { data: busyRows }] = await Promise.all([
      admin.from('profiles').select('id, identifiant').in('id', ids),
      admin
        .from('plans_vol')
        .select('pilote_id, copilote_id')
        .in('statut', [...STATUTS_PLAN_OCCUPES])
        .or(`pilote_id.in.(${ids.join(',')}),copilote_id.in.(${ids.join(',')})`),
    ]);

    const busy = new Set<string>();
    for (const row of busyRows ?? []) {
      if (row.pilote_id) busy.add(row.pilote_id);
      if (row.copilote_id) busy.add(row.copilote_id);
    }

    const copilotes = (profiles ?? [])
      .filter((p) => p.identifiant && !busy.has(p.id))
      .map((p) => ({ id: p.id, identifiant: p.identifiant as string }))
      .sort((a, b) => a.identifiant.localeCompare(b.identifiant, 'fr'));

    return NextResponse.json({ copilotes });
  } catch (e) {
    console.error('plans-vol copilotes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
