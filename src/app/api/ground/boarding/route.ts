export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const planVolId = searchParams.get('plan_vol_id');

  if (!planVolId) {
    return NextResponse.json({ error: 'plan_vol_id requis' }, { status: 400 });
  }

  const { data: boarding, error } = await admin
    .from('boarding_status')
    .select('*')
    .eq('plan_vol_id', planVolId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ boarding });
}

export async function POST(request: Request) {
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
    action?: 'start' | 'update' | 'complete';
    pax_embarques?: number;
    total_pax?: number;
  };

  if (!body.plan_vol_id || !body.action) {
    return NextResponse.json({ error: 'plan_vol_id et action requis' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.action === 'start') {
    if (!body.total_pax) {
      return NextResponse.json({ error: 'total_pax requis pour démarrer le boarding' }, { status: 400 });
    }

    // Vérifier si un boarding existe déjà
    const { data: existing } = await admin
      .from('boarding_status')
      .select('id, statut')
      .eq('plan_vol_id', body.plan_vol_id)
      .maybeSingle();

    if (existing && existing.statut !== 'not_started') {
      return NextResponse.json({ error: 'Boarding déjà démarré ou terminé' }, { status: 409 });
    }

    const upsertData = {
      plan_vol_id: body.plan_vol_id,
      total_pax: body.total_pax,
      pax_embarques: 0,
      statut: 'in_progress',
      started_at: now,
      ground_crew_id: user.id,
    };

    const { data: boarding, error } = await admin
      .from('boarding_status')
      .upsert(upsertData, { onConflict: 'plan_vol_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ boarding }, { status: 201 });
  }

  if (body.action === 'update') {
    if (body.pax_embarques === undefined) {
      return NextResponse.json({ error: 'pax_embarques requis' }, { status: 400 });
    }

    const { data: boarding, error } = await admin
      .from('boarding_status')
      .update({ pax_embarques: body.pax_embarques })
      .eq('plan_vol_id', body.plan_vol_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ boarding });
  }

  if (body.action === 'complete') {
    const { data: boarding, error } = await admin
      .from('boarding_status')
      .update({ statut: 'completed', completed_at: now })
      .eq('plan_vol_id', body.plan_vol_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ boarding });
  }

  return NextResponse.json({ error: 'action invalide' }, { status: 400 });
}
