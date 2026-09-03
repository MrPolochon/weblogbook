import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 90_000;

function cronOk(request: NextRequest): boolean {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

async function run() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString();
  const { data, error } = await admin
    .from('plans_vol')
    .update({
      pending_transfer_aeroport: null,
      pending_transfer_position: null,
      pending_transfer_at: null,
    })
    .not('pending_transfer_aeroport', 'is', null)
    .lt('pending_transfer_at', cutoff)
    .select('id');
  if (error) throw error;
  return { expired: data?.length ?? 0 };
}

export async function GET(request: NextRequest) {
  if (!cronOk(request)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  try {
    const result = await run();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('cron atc-transferts:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
