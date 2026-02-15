import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
        console.error('[LiveKit Token] Bearer auth failed:', tokenError.message, '- Token length:', accessToken.length);
      }
      user = tokenUser;
    } else {
      // Web — authenticate via cookies
      const supabase = await createClient();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }
    
    if (!user) {
      console.error('[LiveKit Token] Utilisateur non authentifié');
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: corsHeaders });
    }

    const body = await request.json();
    const { roomName, participantName } = body;

    if (!roomName) {
      console.error('[LiveKit Token] roomName manquant');
      return NextResponse.json({ error: 'roomName requis' }, { status: 400, headers: corsHeaders });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    console.log('[LiveKit Token] Config check:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasUrl: !!livekitUrl,
      url: livekitUrl?.substring(0, 20) + '...',
    });

    if (!apiKey || !apiSecret) {
      console.error('[LiveKit Token] Credentials manquants - apiKey:', !!apiKey, 'apiSecret:', !!apiSecret);
      return NextResponse.json({ 
        error: 'Service non configuré',
        details: 'Variables d\'environnement LiveKit manquantes'
      }, { status: 500, headers: corsHeaders });
    }

    if (!livekitUrl) {
      console.error('[LiveKit Token] URL LiveKit manquante');
      return NextResponse.json({ 
        error: 'Service non configuré',
        details: 'URL LiveKit manquante'
      }, { status: 500, headers: corsHeaders });
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

    console.log('[LiveKit Token] Token généré pour room:', roomName, 'user:', user.id.substring(0, 8));

    return NextResponse.json({ 
      token,
      url: livekitUrl,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[LiveKit Token] Erreur:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500, headers: corsHeaders });
  }
}
