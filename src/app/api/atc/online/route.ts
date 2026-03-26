import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = createAdminClient();
  const { data: sessions } = await admin.from('atc_sessions')
    .select('aeroport, position, started_at, profiles(callsign)')
    .order('started_at', { ascending: true });

  if (!sessions?.length) return NextResponse.json([]);

  return NextResponse.json(sessions.map(s => {
    const raw = s.profiles as unknown;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    return {
      aeroport: s.aeroport,
      position: s.position,
      started_at: s.started_at,
      callsign: (profile as { callsign?: string } | null)?.callsign || null,
    };
  }));
}
