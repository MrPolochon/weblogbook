export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport')?.toUpperCase();

  if (!aeroport) return NextResponse.json({ error: 'aeroport requis' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('ground_service_requests')
    .select('id, plan_vol_id, service_type, statut, accepted_by, direction, pilote_confirme, pax_count, aeroport, requested_at')
    .ilike('aeroport', aeroport)
    .in('statut', ['pending', 'accepted', 'in_progress'])
    .order('requested_at', { ascending: true });

  if (error) {
    console.error('[/api/ground/demandes] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demandes: data ?? [] });
}
