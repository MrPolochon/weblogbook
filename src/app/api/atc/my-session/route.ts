import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Authenticate via cookies or Bearer token */
async function getAuthUser(request: NextRequest): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7);
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await sb.auth.getUser(accessToken);
    return user;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * GET /api/atc/my-session
 * Returns the current user's active ATC or AFIS session with its VHF frequency.
 * Query params: ?mode=atc or ?mode=afis
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: corsHeaders });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'atc';
    const admin = createAdminClient();

    if (mode === 'atc') {
      const { data: atcSession } = await admin
        .from('atc_sessions')
        .select('aeroport, position')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!atcSession) {
        return NextResponse.json({ session: null, frequency: null, noSession: true }, { headers: corsHeaders });
      }

      const { data: vhfData } = await admin
        .from('vhf_position_frequencies')
        .select('frequency')
        .eq('aeroport', atcSession.aeroport)
        .eq('position', atcSession.position)
        .maybeSingle();

      return NextResponse.json({
        session: { aeroport: atcSession.aeroport, position: atcSession.position },
        frequency: vhfData?.frequency || null,
        noSession: false,
      }, { headers: corsHeaders });

    } else if (mode === 'afis') {
      const { data: afisSession } = await admin
        .from('afis_sessions')
        .select('aeroport, est_afis')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!afisSession?.est_afis) {
        return NextResponse.json({ session: null, frequency: null, noSession: true }, { headers: corsHeaders });
      }

      const { data: vhfData } = await admin
        .from('vhf_position_frequencies')
        .select('frequency')
        .eq('aeroport', afisSession.aeroport)
        .eq('position', 'AFIS')
        .maybeSingle();

      return NextResponse.json({
        session: { aeroport: afisSession.aeroport, position: 'AFIS' },
        frequency: vhfData?.frequency || null,
        noSession: false,
      }, { headers: corsHeaders });
    }

    // Pilot mode
    return NextResponse.json({ session: null, frequency: null, noSession: false }, { headers: corsHeaders });
  } catch (e) {
    console.error('my-session GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: corsHeaders });
  }
}
