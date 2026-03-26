import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function verifyBotSecret(request: NextRequest): boolean {
  const secret = process.env.ATIS_WEBHOOK_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  const xSecret = request.headers.get('x-atis-secret');
  return auth === `Bearer ${secret}` || xSecret === secret;
}

/**
 * GET - Le bot vérifie si l'ATIS est déjà actif avant d'exécuter /atiscreate
 * Retourne { broadcasting, source, aeroport } pour que le bot puisse refuser la commande
 */
export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: state } = await admin
    .from('atis_broadcast_state')
    .select('broadcasting, source, aeroport, position, controlling_user_id, started_at')
    .eq('id', 'default')
    .maybeSingle();

  return NextResponse.json({
    broadcasting: state?.broadcasting ?? false,
    source: state?.source ?? null,
    aeroport: state?.aeroport ?? null,
    position: state?.position ?? null,
    started_at: state?.started_at ?? null,
  });
}

/**
 * POST - Le bot signale qu'un ATIS a été créé/arrêté depuis Discord (/atiscreate ou /atisstop)
 * Body: { action: 'start' | 'stop', aeroport?: string, position?: string }
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, aeroport, position } = body as {
    action?: string;
    aeroport?: string;
    position?: string;
  };

  if (!action || !['start', 'stop'].includes(action)) {
    return NextResponse.json({ error: 'action requis: start | stop' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === 'start') {
    const { data: existing } = await admin
      .from('atis_broadcast_state')
      .select('broadcasting, source')
      .eq('id', 'default')
      .maybeSingle();

    if (existing?.broadcasting) {
      return NextResponse.json({
        error: `ATIS déjà actif (source: ${existing.source || 'inconnue'})`,
        broadcasting: true,
        source: existing.source,
      }, { status: 409 });
    }

    await admin.from('atis_broadcast_state').upsert({
      id: 'default',
      controlling_user_id: null,
      aeroport: aeroport || null,
      position: position || null,
      broadcasting: true,
      source: 'discord',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return NextResponse.json({ ok: true, broadcasting: true, source: 'discord' });
  }

  // action === 'stop'
  await admin.from('atis_broadcast_state').upsert({
    id: 'default',
    controlling_user_id: null,
    aeroport: null,
    position: null,
    broadcasting: false,
    source: null,
    started_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  return NextResponse.json({ ok: true, broadcasting: false });
}
