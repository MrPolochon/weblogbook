import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Action = 'assume' | 'release' | 'transfer' | 'set_altitude' | 'set_squawk';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && !profile.radar_beta)) {
      return NextResponse.json({ error: 'Accès radar non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { action, plan_vol_id, value } = body as {
      action: Action;
      plan_vol_id: string;
      value?: string;
    };

    if (!action || !plan_vol_id) {
      return NextResponse.json({ error: 'action et plan_vol_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: session } = await admin
      .from('atc_sessions')
      .select('aeroport, position')
      .eq('user_id', user.id)
      .single();

    switch (action) {
      case 'assume': {
        const { error } = await admin
          .from('plans_vol')
          .update({
            current_holder_user_id: user.id,
            current_holder_position: session?.position ?? null,
            current_holder_aeroport: session?.aeroport ?? null,
            automonitoring: false,
          })
          .eq('id', plan_vol_id);
        if (error) throw error;
        return NextResponse.json({ ok: true, action: 'assumed' });
      }

      case 'release': {
        const { error } = await admin
          .from('plans_vol')
          .update({
            current_holder_user_id: null,
            current_holder_position: null,
            current_holder_aeroport: null,
            automonitoring: true,
          })
          .eq('id', plan_vol_id)
          .eq('current_holder_user_id', user.id);
        if (error) throw error;
        return NextResponse.json({ ok: true, action: 'released' });
      }

      case 'transfer': {
        if (!value) {
          return NextResponse.json({ error: 'Destination de transfert requise (aeroport:position)' }, { status: 400 });
        }
        const [targetAeroport, targetPosition] = value.split(':');
        const { error } = await admin
          .from('plans_vol')
          .update({
            pending_transfer_aeroport: targetAeroport,
            pending_transfer_position: targetPosition,
            pending_transfer_at: new Date().toISOString(),
          })
          .eq('id', plan_vol_id)
          .eq('current_holder_user_id', user.id);
        if (error) throw error;
        return NextResponse.json({ ok: true, action: 'transfer_initiated' });
      }

      case 'set_altitude': {
        if (!value) {
          return NextResponse.json({ error: 'Altitude requise' }, { status: 400 });
        }
        const { error } = await admin
          .from('plans_vol')
          .update({ strip_fl: value })
          .eq('id', plan_vol_id);
        if (error) throw error;
        return NextResponse.json({ ok: true, action: 'altitude_set', value });
      }

      case 'set_squawk': {
        if (!value) {
          return NextResponse.json({ error: 'Squawk requis' }, { status: 400 });
        }
        const { error } = await admin
          .from('plans_vol')
          .update({ code_transpondeur: value })
          .eq('id', plan_vol_id);
        if (error) throw error;
        return NextResponse.json({ ok: true, action: 'squawk_set', value });
      }

      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('Radar action error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
