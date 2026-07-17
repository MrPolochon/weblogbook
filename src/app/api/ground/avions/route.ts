export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUTS_ACTIFS = ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport')?.toUpperCase();

  if (!aeroport) return NextResponse.json({ error: 'aeroport requis' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Essaie d'abord avec la colonne porte (migration peut être absente)
  let { data, error } = await admin
    .from('plans_vol')
    .select('id, callsign, immatriculation, porte, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
    .or(`aeroport_depart.ilike.${aeroport},aeroport_arrivee.ilike.${aeroport}`)
    .in('statut', STATUTS_ACTIFS)
    .order('created_at', { ascending: false });

  if (error?.message?.includes('porte')) {
    const res = await admin
      .from('plans_vol')
      .select('id, callsign, immatriculation, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
      .or(`aeroport_depart.ilike.${aeroport},aeroport_arrivee.ilike.${aeroport}`)
      .in('statut', STATUTS_ACTIFS)
      .order('created_at', { ascending: false });
    data = res.data;
    error = res.error;
  }

  if (error) {
    console.error('[/api/ground/avions] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const plans = (data ?? []).map(p => ({ porte: null, ...p }));
  return NextResponse.json({ plans });
}
