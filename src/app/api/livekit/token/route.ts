import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('[LiveKit Token] Utilisateur non authentifié');
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { roomName, participantName } = body;

    if (!roomName) {
      console.error('[LiveKit Token] roomName manquant');
      return NextResponse.json({ error: 'roomName requis' }, { status: 400 });
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
      }, { status: 500 });
    }

    if (!livekitUrl) {
      console.error('[LiveKit Token] URL LiveKit manquante');
      return NextResponse.json({ 
        error: 'Service non configuré',
        details: 'URL LiveKit manquante'
      }, { status: 500 });
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
    });
  } catch (error) {
    console.error('[LiveKit Token] Erreur:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}
