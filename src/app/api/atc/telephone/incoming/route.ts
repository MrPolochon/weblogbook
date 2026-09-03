import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanupExpiredCallsForUser } from '@/lib/atc-phone/cleanup-expired-calls';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Vérifier les appels entrants
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { ringingCutoff } = await cleanupExpiredCallsForUser(admin, user.id);

    const { data: incomingCall } = await admin
      .from('atc_calls')
      .select('id, from_user_id, from_aeroport, from_position, number_dialed, started_at, is_emergency')
      .eq('to_user_id', user.id)
      .eq('status', 'ringing')
      .gte('started_at', ringingCutoff)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (incomingCall) {
      return NextResponse.json({
        call: {
          id: incomingCall.id,
          from_aeroport: incomingCall.from_aeroport,
          from_position: incomingCall.from_position,
          number_dialed: incomingCall.number_dialed,
          is_emergency: incomingCall.is_emergency,
        },
      });
    }

    return NextResponse.json({ call: null });
  } catch (e) {
    console.error('Erreur GET telephone/incoming:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
