import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

async function checkAtc() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autorisé', status: 401 };
  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return { error: 'Accès ATC requis.', status: 403 };
  return null;
}

export async function GET() {
  const err = await checkAtc();
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });
  const result = await fetchAtisBot<Record<string, unknown>>('/webhook/atis-data');
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
  const err = await checkAtc();
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });
  const body = await request.json().catch(() => ({}));
  const result = await fetchAtisBot<{ ok: boolean; data?: Record<string, unknown> }>('/webhook/atis-data', {
    method: 'PATCH',
    body,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
