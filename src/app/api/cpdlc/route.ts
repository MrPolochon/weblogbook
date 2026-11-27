import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { CpdlcError } from '@/lib/cpdlc/policy';
import { contextFor, executeCommand, readInbox } from '@/lib/cpdlc/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
function failure(error: unknown) {
  if (error instanceof CpdlcError) return NextResponse.json({ available: false, error: error.message }, { status: error.status });
  console.error('[cpdlc]', error);
  return NextResponse.json({ available: false, error: 'CPDLC TEMPORARILY UNAVAILABLE' }, { status: 503 });
}
async function userId() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new CpdlcError('AUTHENTICATION REQUIRED', 401);
  return user.id;
}
export async function GET(request: NextRequest) {
  try {
    const user = await userId(); const admin = createAdminClient();
    const context = await contextFor(admin, user, request.nextUrl.searchParams.get('plan_id'));
    return NextResponse.json(await readInbox(admin, context), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await userId();
    const limit = await rateLimitShared(`cpdlc:${user}`, 90, 60_000);
    if (!limit.allowed) throw new CpdlcError('TOO MANY REQUESTS - TRY AGAIN SHORTLY', 429);
    if (Number(request.headers.get('content-length') || 0) > 16000) throw new CpdlcError('REQUEST TOO LARGE', 413);
    const raw = await request.text();
    if (raw.length > 16000) throw new CpdlcError('REQUEST TOO LARGE', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new CpdlcError('INVALID REQUEST'); }
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new CpdlcError('INVALID REQUEST');
    const admin = createAdminClient(); const context = await contextFor(admin, user, body.plan_id);
    const id = await executeCommand(admin, context, body);
    return NextResponse.json({ ok: true, message_id: id });
  } catch (error) { return failure(error); }
}
