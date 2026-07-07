export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignGateManual } from '@/lib/ground/gate-assignment';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gateId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'ground_crew' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Accès refusé — rôle ground_crew requis' }, { status: 403 });
  }

  const body = await request.json() as {
    plan_vol_id?: string;
    assignment_type?: 'depart' | 'arrivee';
    aeroport?: string;
  };

  if (!body.plan_vol_id || !body.assignment_type || !body.aeroport) {
    return NextResponse.json({ error: 'plan_vol_id, assignment_type et aeroport requis' }, { status: 400 });
  }

  const result = await assignGateManual(body.plan_vol_id, gateId, body.assignment_type, body.aeroport);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ assignment: result.assignment }, { status: 201 });
}
