import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// CORS strict : exige une origine connue (variable NEXT_PUBLIC_APP_URL).
// On évite '*' parce que cette route délivre un JWT LiveKit sensible.
const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin || 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Liste blanche des préfixes de roomName autorisés.
// - call-<uuid> : appels téléphoniques (vérifiés en DB plus bas)
// - vhf-<freq>  : conférences VHF (à étendre si besoin)
const ALLOWED_ROOM_PREFIXES = ['call-', 'vhf-'];

function isValidRoomName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 100) return false;
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return false;
  return ALLOWED_ROOM_PREFIXES.some((p) => name.startsWith(p));
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
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
        console.error('[LiveKit Token] Bearer auth failed');
      }
      user = tokenUser;
    } else {
      // Web — authenticate via cookies
      const supabase = await createClient();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: corsHeaders });
    }

    const rl = rateLimit(`livekit:${user.id}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: corsHeaders });

    const body = await request.json();
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
        .select('from_user_id, to_user_id')
        .eq('id', callId)
        .single();

      if (!call || (call.from_user_id !== user.id && call.to_user_id !== user.id)) {
        return NextResponse.json({ error: 'Non autorisé pour cet appel' }, { status: 403, headers: corsHeaders });
      }
    }
    // NB: pour 'vhf-<freq>', toute personne authentifiée peut publier sur la fréquence
    // (comportement radio = auditeur libre, parlant libre). Si tu veux une autorisation
    // par fréquence (ex. seuls les ATC), c'est à ajouter ici.

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error('[LiveKit Token] Configuration manquante');
      return NextResponse.json({ error: 'Service vocal non configuré' }, { status: 500, headers: corsHeaders });
    }

    // Créer le token d'accès
    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: participantName || user.id,
      ttl: '10m', // Token valide 10 minutes
    });

    // Permissions pour le participant
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({ 
      token,
      url: livekitUrl,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[LiveKit Token] Erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: corsHeaders });
  }
}
