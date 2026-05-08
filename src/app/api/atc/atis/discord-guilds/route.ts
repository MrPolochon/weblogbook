import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCachedGuilds } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

  const result = await getCachedGuilds();
  if (result.error && result.guilds.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ guilds: result.guilds, cached: result.cached ?? false });
}
