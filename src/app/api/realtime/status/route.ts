import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  return NextResponse.json({ provider: 'cloudflare', protocol: 1,
    configured: !!(process.env.CLOUDFLARE_REALTIME_SECRET && process.env.CLOUDFLARE_REALTIME_URL),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
