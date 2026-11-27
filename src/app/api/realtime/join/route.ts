import { canTransmitRadio } from '@/lib/radio-access';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { isValidVhfFrequency, roomNameToFrequency } from '@/lib/vhf-frequencies';

export const dynamic = 'force-dynamic';

// Web origins and packaged Electron (opaque file origin); native clients use Bearer auth.
const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
function corsHeadersFor(request: Request) {
  const origin = request.headers.get('origin') || '';
  const known = [allowedOrigin, 'null', 'file://'];
  return {
    'Access-Control-Allow-Origin': origin && known.includes(origin) ? origin : allowedOrigin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// Liste blanche des préfixes de roomName autorisés.
// - call-<uuid> : appels téléphoniques (vérifiés en DB plus bas)
// - vhf-<freq>  : conférences VHF (à étendre si besoin)


function isValidRoomName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 100) return false;
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return false;
  if (name.startsWith('vhf-')) {
    const frequency = roomNameToFrequency(name);
    return frequency !== null && isValidVhfFrequency(frequency);
  }
  return /^call-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(name);
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeadersFor(request) });
}

export async function POST(request: NextRequest) {
  const corsHeaders = corsHeadersFor(request);
  try {
    // Support both cookie-based auth (web) and Bearer token auth (Electron app)
    let user: { id: string } | null = null;
    const authHeader = request.headers.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
      // External app (Electron/Android) — authenticate via access token
      const accessToken = authHeader.substring(7);
      const supabaseAdmin = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user: tokenUser }, error: tokenError } = await supabaseAdmin.auth.getUser(accessToken);
      if (tokenError) {
        // On évite de logger longueur/préfixe du token pour ne pas faciliter le profilage d'attaques.
        console.error('[Cloudflare Token] Bearer auth failed');
      }
      user = tokenUser;
    } else if (!['null', 'file://'].includes(request.headers.get('origin') || '')) {
      // Web — authenticate via cookies
      const supabase = await createClient();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: corsHeaders });
    }

    const rl = await rateLimitShared(`realtime:${user.id}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: corsHeaders });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400, headers: corsHeaders }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400, headers: corsHeaders });
    const { roomName, participantName } = body;

    if (!roomName) {
      return NextResponse.json({ error: 'roomName requis' }, { status: 400, headers: corsHeaders });
    }
    if (!isValidRoomName(roomName)) {
      return NextResponse.json({ error: 'roomName invalide' }, { status: 400, headers: corsHeaders });
    }

    if (roomName.startsWith('call-')) {
      const callId = roomName.substring(5);
      const admin = createAdminClient();
      const { data: call } = await admin
        .from('atc_calls')
        .select('from_user_id, to_user_id, status')
        .eq('id', callId)
        .single();

      if (!call || !['ringing', 'connected'].includes(call.status) || (call.from_user_id !== user.id && call.to_user_id !== user.id)) {
        return NextResponse.json({ error: 'Non autorisé pour cet appel' }, { status: 403, headers: corsHeaders });
      }
    }
    // The client may opt into OBS, but only the server grants transmission.
    const canPublish = roomName.startsWith('call-') || (body.observer !== true && await canTransmitRadio(user.id));

    const secret = process.env.CLOUDFLARE_REALTIME_SECRET;
    const url = process.env.CLOUDFLARE_REALTIME_URL;
    if (!secret || secret.length < 32 || !url || !url.startsWith('wss://')) {
      return NextResponse.json({ error: 'Service vocal Cloudflare non configuré' }, { status: 503, headers: corsHeaders });
    }
    const iat = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ aud: 'weblogbook-radio', sub: user.id, room: roomName,
      name: typeof participantName === 'string' ? participantName.trim().slice(0, 80) || user.id : user.id,
      canPublish, iat, exp: iat + 60, jti: randomUUID(),
    })).toString('base64url');
    const signature = createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
    return NextResponse.json({ token: header + '.' + payload + '.' + signature, url, provider: 'cloudflare', protocol: 1, canPublish },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Cloudflare Token] Erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: corsHeaders });
  }
}
