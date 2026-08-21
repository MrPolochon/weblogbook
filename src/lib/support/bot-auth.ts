import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export function assertSupportBotSecret(req: NextRequest): NextResponse | null {
  const expected = (process.env.SUPPORT_BOT_SECRET || process.env.ATIS_WEBHOOK_SECRET || '').trim();
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
