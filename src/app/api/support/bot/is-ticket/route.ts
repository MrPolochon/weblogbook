export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';

export async function GET(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;
  const channelId = String(req.nextUrl.searchParams.get('channel_id') || '').trim();
  if (!channelId) {
    return NextResponse.json({ error: 'channel_id requis' }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('support_tickets')
    .select('id')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  return NextResponse.json({ ok: true, is_ticket: Boolean(data) });
}
