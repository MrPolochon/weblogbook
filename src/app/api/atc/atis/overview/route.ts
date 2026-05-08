import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { getBotOverview, getCachedGuilds, type BotInstanceStatus } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';

interface StateRow {
  id: string;
  controlling_user_id: string | null;
  aeroport: string | null;
  position: string | null;
  broadcasting: boolean | null;
  source: string | null;
  started_at: string | null;
}

interface ConfigRow {
  id: string;
  discord_guild_id: string | null;
  discord_guild_name: string | null;
  discord_channel_id: string | null;
  discord_channel_name: string | null;
}

interface ProfileRow {
  id: string;
  identifiant: string | null;
}

interface ControllerInfo {
  user_id: string;
  identifiant: string | null;
  display_name: string;
}

export interface AtisInstanceOverview {
  instance_id: number;
  // Etat DB
  controlling_user_id: string | null;
  controller: ControllerInfo | null;
  aeroport: string | null;
  position: string | null;
  source: 'site' | 'discord' | null;
  started_at: string | null;
  // Etat bot. broadcasting prefere la source vivante (bot) pour eviter
  // les etats "zombie" ou la DB et le bot divergent.
  broadcasting: boolean;
  // Detail des deux sources pour permettre a l'UI de detecter une desync.
  bot_broadcasting: boolean;
  db_broadcasting: boolean;
  desync: boolean;
  ready: boolean;
  airport: string | null;
  airport_name: string | null;
  voice_channel_id: string | null;
  voice_channel_name: string | null;
  voice_guild_id: string | null;
  voice_guild_name: string | null;
  voice_connected: boolean;
  atis_code: string | null;
  atis_text: string | null;
  bilingual: boolean;
  last_updated: string | null;
  // Config Discord persistee
  config: {
    discord_guild_id: string | null;
    discord_guild_name: string | null;
    discord_channel_id: string | null;
    discord_channel_name: string | null;
    configured: boolean;
  };
  is_mine: boolean;
}

export interface AtisOverviewResponse {
  instances: AtisInstanceOverview[];
  instances_count: number;
  guilds: { id: string; name: string }[];
  bot: {
    reachable: boolean;
    error?: string | null;
    latency_ms?: number;
    version?: string;
    uptime_seconds?: number;
  };
  user_prefs: {
    atis_ticker_visible: boolean;
    atis_code_auto_rotate: boolean;
  };
  // Champs legacy pour compat ancienne UI / ticker non migré.
  any_broadcasting: boolean;
  controlling_user_id: string | null;
  aeroport: string | null;
  position: string | null;
  broadcasting: boolean;
  source: string | null;
  atis_text: string | null;
  atis_ticker_visible: boolean;
  atis_code_auto_rotate: boolean;
}

function buildController(profile: ProfileRow | undefined): ControllerInfo | null {
  if (!profile) return null;
  return {
    user_id: profile.id,
    identifiant: profile.identifiant,
    display_name: profile.identifiant || profile.id.slice(0, 8),
  };
}

/**
 * GET /api/atc/atis/overview
 * Renvoie en 1 call : etat de toutes les instances (DB+bot+config), guilds Discord,
 * ATC controleurs (nom/avatar), preferences utilisateur, et meta du bot (latency,
 * version, uptime). Reduit drastiquement le nombre de round-trips depuis le panneau.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, atc, atis_ticker_visible, atis_code_auto_rotate')
      .eq('id', user.id)
      .single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const admin = createAdminClient();

    // 1. Charge tout l'etat DB en parallele.
    const [stateRes, configRes] = await Promise.all([
      admin
        .from('atis_broadcast_state')
        .select('id, controlling_user_id, aeroport, position, broadcasting, source, started_at')
        .order('id'),
      admin
        .from('atis_broadcast_config')
        .select('id, discord_guild_id, discord_guild_name, discord_channel_id, discord_channel_name')
        .order('id'),
    ]);

    const stateRows = (stateRes.data ?? []) as StateRow[];
    const configRows = (configRes.data ?? []) as ConfigRow[];
    const configByInstance = new Map<number, ConfigRow>();
    for (const c of configRows) {
      const id = parseInt(c.id, 10);
      if (Number.isFinite(id)) configByInstance.set(id, c);
    }

    // 2. Charge les profils des controleurs en 1 query.
    const controllerIds = stateRows
      .map((r) => r.controlling_user_id)
      .filter((id): id is string => Boolean(id));
    const profilesById = new Map<string, ProfileRow>();
    if (controllerIds.length > 0) {
      const { data: profilesData } = await admin
        .from('profiles')
        .select('id, identifiant')
        .in('id', controllerIds);
      for (const p of (profilesData ?? []) as ProfileRow[]) {
        profilesById.set(p.id, p);
      }
    }

    // 3. Etat live du bot (1 call).
    const overview = await getBotOverview();
    const botByInstance = new Map<number, BotInstanceStatus>();
    for (const b of overview.data?.instances ?? []) {
      botByInstance.set(b.instance_id, b);
    }
    const reachable = !overview.error && Boolean(overview.data);

    // 4. Guilds (avec cache si overview ne les a pas renvoyes).
    let guilds: { id: string; name: string }[] = overview.data?.guilds ?? [];
    if (guilds.length === 0 && reachable) {
      const cachedGuilds = await getCachedGuilds();
      guilds = cachedGuilds.guilds;
    }

    // 5. Determine le nombre d'instances a afficher : max(DB, bot, config).
    const instanceIds = new Set<number>();
    for (const r of stateRows) {
      const id = parseInt(r.id, 10);
      if (Number.isFinite(id)) instanceIds.add(id);
    }
    for (const c of configRows) {
      const id = parseInt(c.id, 10);
      if (Number.isFinite(id)) instanceIds.add(id);
    }
    for (const b of overview.data?.instances ?? []) {
      instanceIds.add(b.instance_id);
    }
    if (overview.data?.instances_count) {
      for (let i = 1; i <= overview.data.instances_count; i++) instanceIds.add(i);
    }
    if (instanceIds.size === 0) {
      // Defaut minimal pour permettre la config initiale.
      instanceIds.add(1);
    }
    const sortedIds = Array.from(instanceIds).sort((a, b) => a - b);

    // 6. Construit le payload par instance.
    const stateById = new Map<number, StateRow>();
    for (const r of stateRows) {
      const id = parseInt(r.id, 10);
      if (Number.isFinite(id)) stateById.set(id, r);
    }

    const instances: AtisInstanceOverview[] = sortedIds.map((instance_id) => {
      const dbRow = stateById.get(instance_id);
      const bot = botByInstance.get(instance_id);
      const config = configByInstance.get(instance_id);

      // Source de verite : le bot (etat live) quand il est joignable, sinon la DB.
      // Cela evite les etats "zombie" (bot diffuse mais DB pas a jour, ou inverse).
      const botBroadcasting = Boolean(bot?.broadcasting);
      const dbBroadcasting = Boolean(dbRow?.broadcasting);
      const broadcasting = reachable ? botBroadcasting : dbBroadcasting;
      const desync = reachable && botBroadcasting !== dbBroadcasting;

      const controllerProfile = dbRow?.controlling_user_id
        ? profilesById.get(dbRow.controlling_user_id)
        : undefined;

      return {
        instance_id,
        controlling_user_id: dbRow?.controlling_user_id ?? null,
        controller: buildController(controllerProfile),
        aeroport: dbRow?.aeroport ?? null,
        position: dbRow?.position ?? null,
        source: (dbRow?.source ?? null) as 'site' | 'discord' | null,
        started_at: dbRow?.started_at ?? null,
        broadcasting,
        bot_broadcasting: botBroadcasting,
        db_broadcasting: dbBroadcasting,
        desync,
        ready: bot?.ready ?? false,
        airport: bot?.airport ?? null,
        airport_name: bot?.airport_name ?? null,
        voice_channel_id: bot?.channel_id ?? null,
        voice_channel_name: bot?.channel ?? null,
        voice_guild_id: bot?.guild_id ?? null,
        voice_guild_name: bot?.guild ?? null,
        voice_connected: bot?.voice_connected ?? false,
        atis_code: bot?.atis_code ?? null,
        atis_text: bot?.atis_text ?? null,
        bilingual: bot?.bilingual ?? false,
        last_updated: bot?.last_updated ?? null,
        config: {
          discord_guild_id: config?.discord_guild_id ?? null,
          discord_guild_name: config?.discord_guild_name ?? null,
          discord_channel_id: config?.discord_channel_id ?? null,
          discord_channel_name: config?.discord_channel_name ?? null,
          configured: Boolean(config?.discord_guild_id && config?.discord_channel_id),
        },
        is_mine: dbRow?.controlling_user_id === user.id,
      };
    });

    const mine = instances.find((i) => i.is_mine) ?? null;
    const fallback = instances.find((i) => i.broadcasting) ?? null;
    const focused = mine ?? fallback;

    const payload: AtisOverviewResponse = {
      instances,
      instances_count: instances.length,
      guilds,
      bot: {
        reachable,
        error: overview.error ?? null,
        latency_ms: overview.latencyMs,
        version: overview.data?.version,
        uptime_seconds: overview.data?.uptime_seconds,
      },
      user_prefs: {
        atis_ticker_visible: profile?.atis_ticker_visible ?? true,
        atis_code_auto_rotate: profile?.atis_code_auto_rotate ?? false,
      },
      any_broadcasting: instances.some((i) => i.broadcasting),
      // Legacy fields (ancien UI / ticker).
      controlling_user_id: focused?.controlling_user_id ?? null,
      aeroport: focused?.aeroport ?? null,
      position: focused?.position ?? null,
      broadcasting: focused?.broadcasting ?? false,
      source: focused?.source ?? null,
      atis_text: focused?.atis_text ?? null,
      atis_ticker_visible: profile?.atis_ticker_visible ?? true,
      atis_code_auto_rotate: profile?.atis_code_auto_rotate ?? false,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error('ATIS overview:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
