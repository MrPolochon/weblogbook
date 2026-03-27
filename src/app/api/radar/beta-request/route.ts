import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasApprovedRadarAccessForUser } from '@/lib/radar-access';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('radar_beta_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Une demande est déjà en cours.' }, { status: 409 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    const hasAccess = await hasApprovedRadarAccessForUser(user.id, profile?.role, profile?.radar_beta);
    if (hasAccess) {
      return NextResponse.json({ error: 'Vous avez déjà accès au radar.' }, { status: 409 });
    }

    const { error } = await admin
      .from('radar_beta_requests')
      .insert({ user_id: user.id });

    if (error) throw error;

    return NextResponse.json({ ok: true, message: 'Demande envoyée.' });
  } catch (err) {
    console.error('Beta request error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    const { data: request } = await admin
      .from('radar_beta_requests')
      .select('id, status, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { data: profile } = await admin
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    const hasAccess = await hasApprovedRadarAccessForUser(user.id, profile?.role, profile?.radar_beta);

    return NextResponse.json({
      radar_beta: hasAccess,
      request: request ?? null,
    });
  } catch {
    return NextResponse.json({ radar_beta: false, request: null });
  }
}
