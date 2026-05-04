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

function resolveInstanceId(value: unknown): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * GET - Le bot vérifie si l'ATIS est déjà actif avant d'exécuter /atiscreate.
 *
 * Multi-instance : on retourne l'état de l'instance précisée par ?instance_id=X.
 * Si non précisé, instance 1 par défaut.
 */
export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 401 });
  }

  const instanceId = resolveInstanceId(request.nextUrl.searchParams.get('instance_id'));

  const admin = createAdminClient();
  const { data: state } = await admin
    .from('atis_broadcast_state')
    .select('broadcasting, source, aeroport, position, controlling_user_id, started_at')
    .eq('id', String(instanceId))
    .maybeSingle();

  return NextResponse.json({
    instance_id: instanceId,
    broadcasting: state?.broadcasting ?? false,
    source: state?.source ?? null,
    aeroport: state?.aeroport ?? null,
    position: state?.position ?? null,
    started_at: state?.started_at ?? null,
  });
}

/**
 * POST - Le bot signale qu'un ATIS a été créé/arrêté depuis Discord (/atiscreate ou /atisstop).
 * Body: { action: 'start' | 'stop', aeroport?: string, position?: string, instance_id?: number }
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, aeroport, position, instance_id } = body as {
    action?: string;
    aeroport?: string;
    position?: string;
    instance_id?: number | string;
  };

  if (!action || !['start', 'stop'].includes(action)) {
    return NextResponse.json({ error: 'action requis: start | stop' }, { status: 400 });
  }

  const instanceId = resolveInstanceId(instance_id);
  const admin = createAdminClient();

  if (action === 'start') {
    const { data: existing } = await admin
      .from('atis_broadcast_state')
      .select('broadcasting, source')
      .eq('id', String(instanceId))
      .maybeSingle();

    if (existing?.broadcasting) {
      return NextResponse.json(
        {
          error: `ATIS déjà actif (instance ${instanceId}, source: ${existing.source || 'inconnue'})`,
          broadcasting: true,
          source: existing.source,
        },
        { status: 409 }
      );
    }

    // Vérifie qu'aucune autre instance ne diffuse cet aéroport.
    if (aeroport) {
      const { data: aeroBusy } = await admin
        .from('atis_broadcast_state')
        .select('id')
        .eq('aeroport', String(aeroport).toUpperCase())
        .eq('broadcasting', true)
        .neq('id', String(instanceId))
        .maybeSingle();
      if (aeroBusy) {
        return NextResponse.json(
          {
            error: `ATIS de ${aeroport} déjà diffusé par l'instance ${aeroBusy.id}`,
          },
          { status: 409 }
        );
      }
    }

    await admin.from('atis_broadcast_state').upsert(
      {
        id: String(instanceId),
        controlling_user_id: null,
        aeroport: aeroport || null,
        position: position || null,
        broadcasting: true,
        source: 'discord',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    return NextResponse.json({
      ok: true,
      broadcasting: true,
      source: 'discord',
      instance_id: instanceId,
    });
  }

  // action === 'stop'
  await admin.from('atis_broadcast_state').upsert(
    {
      id: String(instanceId),
      controlling_user_id: null,
      aeroport: null,
      position: null,
      broadcasting: false,
      source: null,
      started_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  return NextResponse.json({ ok: true, broadcasting: false, instance_id: instanceId });
}
