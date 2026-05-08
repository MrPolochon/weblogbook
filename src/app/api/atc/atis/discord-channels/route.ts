import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getCachedChannels } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

  const guildId = request.nextUrl.searchParams.get('guild_id');
  if (!guildId) return NextResponse.json({ error: 'guild_id requis' }, { status: 400 });

  const result = await getCachedChannels(guildId);
  if (result.error && result.channels.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ channels: result.channels, cached: result.cached ?? false });
}
