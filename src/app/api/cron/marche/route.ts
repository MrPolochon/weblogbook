import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function cronOk(request: NextRequest): boolean {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

async function run() {
  const admin = createAdminClient();
  const [pax, cargo] = await Promise.all([
    admin.rpc('regenerer_passagers_aeroport'),
    admin.rpc('regenerer_cargo_aeroport'),
  ]);
  return {
    passagers: pax.error ? { ok: false as const, error: pax.error.message } : { ok: true as const },
    cargo: cargo.error ? { ok: false as const, error: cargo.error.message } : { ok: true as const },
  };
}

export async function GET(request: NextRequest) {
  if (!cronOk(request)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  try {
    const result = await run();
    const ok = result.passagers.ok && result.cargo.ok;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 207 });
  } catch (e) {
    console.error('cron marche:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
