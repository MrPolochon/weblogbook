import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export function assertSupportBotSecret(req: NextRequest): NextResponse | null {
  // Secret dédié — ne jamais retomber sur ATIS_WEBHOOK_SECRET.
  const expected = (process.env.SUPPORT_BOT_SECRET || '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'SUPPORT_BOT_SECRET non configuré' }, { status: 503 });
  }
  const got = (req.headers.get('x-support-bot-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '').trim();
  if (got !== expected) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return null;
}

export async function getSupportConfig() {
  const admin = createAdminClient();
  const { data } = await admin.from('support_bot_config').select('*').eq('id', 'default').maybeSingle();
  return data;
}

/** Dernier id Discord annoncé par le process Railway (gateway). */
let cachedGatewayUser: { id: string; at: number } | null = null;

export function getCachedSupportGatewayUser() {
  return cachedGatewayUser;
}

export function rememberSupportGatewayUser(userId: string | null | undefined) {
  const id = String(userId || '').trim();
  if (!id) return;
  cachedGatewayUser = { id, at: Date.now() };
  const admin = createAdminClient();
  void admin
    .from('support_bot_config')
    .update({ gateway_bot_user_id: id, gateway_seen_at: new Date().toISOString() })
    .eq('id', 'default');
}
