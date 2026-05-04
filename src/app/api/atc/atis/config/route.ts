import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function checkAtc() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autorisé', status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, atc')
    .eq('id', user.id)
    .single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return { error: 'Accès ATC requis.', status: 403 };
  return null;
}

function resolveInstanceId(value: string | null | undefined): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

interface ConfigRow {
  id?: string;
  discord_guild_id?: string;
  discord_guild_name?: string;
  discord_channel_id?: string;
  discord_channel_name?: string;
}

/**
 * GET - Config Discord ATIS pour une instance.
 *   - ?instance_id=X : retourne la config de cette instance
 *   - ?all=true : retourne la config de toutes les instances (tableau)
 *   - sinon : retourne la config de l'instance 1 (legacy)
 */
export async function GET(request: NextRequest) {
  const err = await checkAtc();
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });
  const admin = createAdminClient();

  const wantAll = request.nextUrl.searchParams.get('all') === 'true';

  if (wantAll) {
    let configs: ConfigRow[] = [];
    try {
      const { data } = await admin
        .from('atis_broadcast_config')
        .select('id, discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name')
        .order('id');
      configs = (data ?? []) as ConfigRow[];
    } catch {
      // table peut ne pas exister
    }
    return NextResponse.json({ configs });
  }

  const instanceId = resolveInstanceId(request.nextUrl.searchParams.get('instance_id'));

  let config: ConfigRow | null = null;
  try {
    const { data } = await admin
      .from('atis_broadcast_config')
      .select('discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name')
      .eq('id', String(instanceId))
      .maybeSingle();
    config = data;
  } catch {
    // Table peut ne pas exister
  }
  return NextResponse.json(config ?? {});
}

export async function PATCH(request: NextRequest) {
  const err = await checkAtc();
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });
  const body = await request.json().catch(() => ({}));
  const {
    discord_guild_id,
    discord_guild_name,
    discord_channel_id,
    discord_channel_name,
    instance_id,
  } = body;
  const instanceId = resolveInstanceId(typeof instance_id === 'string' ? instance_id : String(instance_id ?? ''));
  const admin = createAdminClient();
  try {
    await admin.from('atis_broadcast_config').upsert(
      {
        id: String(instanceId),
        discord_guild_id: discord_guild_id ?? null,
        discord_guild_name: discord_guild_name ?? null,
        discord_channel_id: discord_channel_id ?? null,
        discord_channel_name: discord_channel_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    return NextResponse.json({ ok: true, instance_id: instanceId });
  } catch (e) {
    console.error('ATIS config save:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
