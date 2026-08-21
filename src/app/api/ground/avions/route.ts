export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLAN_VOL_SOL_SELECT, mapPlanVolSol, type PlanVolSolRow } from '@/lib/ground/plans-vol';

const STATUTS_ACTIFS = ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport')?.toUpperCase();

  if (!aeroport) return NextResponse.json({ error: 'aeroport requis' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('plans_vol')
    .select(PLAN_VOL_SOL_SELECT)
    .or(`aeroport_depart.ilike.${aeroport},aeroport_arrivee.ilike.${aeroport}`)
    .in('statut', STATUTS_ACTIFS)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/ground/avions] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const plans = ((data ?? []) as unknown as PlanVolSolRow[]).map(mapPlanVolSol);
  return NextResponse.json({ plans });
}
