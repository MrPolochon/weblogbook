import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session-service
 * Indique si l'utilisateur est actuellement en service ATC ou SIAVI (AFIS).
 * Utilisé pour ne pas déconnecter pour inactivité tant qu'il est en service.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ inAtcSession: false, inSiaviSession: false });
    }

    const admin = createAdminClient();
    const [{ data: atcSession }, { data: afisSession }] = await Promise.all([
      admin.from('atc_sessions').select('id').eq('user_id', user.id).maybeSingle(),
      admin.from('afis_sessions').select('id').eq('user_id', user.id).eq('est_afis', true).maybeSingle(),
    ]);

    return NextResponse.json({
      inAtcSession: !!atcSession,
      inSiaviSession: !!afisSession,
    });
  } catch (e) {
    console.error('session-service GET:', e);
    return NextResponse.json({ inAtcSession: false, inSiaviSession: false });
  }
}
