import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

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
  const admin = createAdminClient();
  let config: { discord_guild_id?: string; discord_guild_name?: string; discord_channel_id?: string; discord_channel_name?: string } | null = null;
  try {
    const { data } = await admin.from('atis_broadcast_config').select('discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name').eq('id', 'default').maybeSingle();
    config = data;
  } catch {
    // Table peut ne pas exister (migration non exécutée)
  }
  return NextResponse.json(config ?? {});
}

export async function PATCH(request: NextRequest) {
  const err = await checkAtc();
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });
  const body = await request.json().catch(() => ({}));
  const { discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name } = body;
  const admin = createAdminClient();
  try {
    await admin.from('atis_broadcast_config').upsert({
      id: 'default',
      discord_guild_id: discord_guild_id ?? null,
      discord_guild_name: discord_guild_name ?? null,
      discord_channel_id: discord_channel_id ?? null,
      discord_channel_name: discord_channel_name ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ATIS config save:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
