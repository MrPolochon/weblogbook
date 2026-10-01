export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';
import { processTicketUpdateReset } from '@/lib/support/update-reset';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await processTicketUpdateReset());
  } catch (error) {
    console.error('[support-update-reset]', error);
    return NextResponse.json({ error: 'Réinitialisation indisponible' }, { status: 503 });
  }
}
