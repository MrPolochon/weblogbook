import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Client pour appeler l'API du bot ATIS (ATISVoiceMaker).
 *
 * Le bot supporte plusieurs instances Discord en parallèle (instance_id 1, 2, ...).
 * Les routes du bot sont :
 *   - /webhook/<path>            -> instance 1 par défaut (legacy)
 *   - /webhook/<id>/<path>       -> instance précise
 *   - /webhook/status-all        -> état de toutes les instances
 *   - /webhook/available         -> 1ère instance non broadcasting
 *   - /webhook/overview          -> status-all + guilds + meta en 1 call
 *   - /webhook/health            -> diagnostic complet (uptime, version, etc.)
 */

const getBotUrl = () => process.env.ATIS_WEBHOOK_URL?.replace(/\/$/, '');
const getSecret = () => process.env.ATIS_WEBHOOK_SECRET;

const headers = () => ({
  Authorization: `Bearer ${getSecret()}`,
  'X-ATIS-Secret': getSecret() ?? '',
  'Content-Type': 'application/json',
});

export interface FetchAtisBotOptions {
  method?: string;
  body?: unknown;
  /**
   * Si fourni, route la requête vers /webhook/<instance_id>/<path>.
   * Sinon, utilise /webhook/<path> (équivalent instance 1).
   */
  instanceId?: number;
  /**
   * Timeout par requête. Render free tier peut nécessiter ~45s pour cold start
   * sur la 1ère requête, mais une fois chaud les calls sont <1s.
   */
  timeoutMs?: number;
}

function buildPath(path: string, instanceId?: number): string {
  if (!instanceId) return path;
  const stripped = path.replace(/^\/webhook/, '');
  return `/webhook/${instanceId}${stripped}`;
}

export async function fetchAtisBot<T>(
  path: string,
  options?: FetchAtisBotOptions
): Promise<{ data?: T; error?: string; status: number; latencyMs?: number }> {
  const url = getBotUrl();
  if (!url || !getSecret()) {
    return { error: 'Bot ATIS non configuré (ATIS_WEBHOOK_URL/SECRET)', status: 503 };
  }
  const finalPath = buildPath(path, options?.instanceId);
  const timeoutMs = options?.timeoutMs ?? 45000;
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}${finalPath}`, {
      method: options?.method ?? 'GET',
      headers: headers(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - t0;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error ||
        (res.status === 401
          ? 'Secret incorrect (ATIS_WEBHOOK_SECRET)'
          : res.status === 503
            ? 'Bot non prêt ou webhook non configuré'
            : `Erreur ${res.status}`);
      return { error: msg, status: res.status, latencyMs };
    }
    return { data, status: res.status, latencyMs };
  } catch (e) {
    console.error('ATIS bot fetch:', e);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    return {
      error: isTimeout
        ? 'Délai dépassé (le bot Render démarre peut-être, réessayez dans 1 min)'
        : 'Erreur de connexion au bot',
      status: 500,
      latencyMs: Date.now() - t0,
    };
  }
}

export async function getAvailableBotInstance(): Promise<{ instance_id: number | null; error?: string }> {
  const result = await fetchAtisBot<{ instance_id: number | null; available: boolean }>('/webhook/available');
  if (result.error) return { instance_id: null, error: result.error };
  return { instance_id: result.data?.instance_id ?? null };
}

export interface BotInstanceStatus {
  instance_id: number;
  broadcasting: boolean;
  ready?: boolean;
  airport?: string | null;
  airport_name?: string | null;
  channel?: string | null;
  channel_id?: string | null;
  guild?: string | null;
  guild_id?: string | null;
  voice_connected?: boolean;
  atis_text?: string | null;
  atis_code?: string | null;
  bilingual?: boolean;
  last_updated?: string | null;
}

export async function getAllBotStatuses(): Promise<{
  instances: BotInstanceStatus[];
  error?: string;
}> {
  const result = await fetchAtisBot<{ instances: BotInstanceStatus[] }>('/webhook/status-all');
  if (result.error) return { instances: [], error: result.error };
  return { instances: result.data?.instances ?? [] };
}

// ---------------------------------------------------------------------------
// Overview consolidé (status-all + guilds + meta) — utilisé par /api/atc/atis/overview
// ---------------------------------------------------------------------------

export interface BotOverviewResponse {
  instances: BotInstanceStatus[];
  instances_count: number;
  guilds: { id: string; name: string }[];
  version?: string;
  uptime_seconds?: number;
}

export async function getBotOverview(): Promise<{
  data?: BotOverviewResponse;
  error?: string;
  latencyMs?: number;
}> {
  const result = await fetchAtisBot<BotOverviewResponse>('/webhook/overview');
  if (result.error) return { error: result.error, latencyMs: result.latencyMs };
  return { data: result.data, latencyMs: result.latencyMs };
}

// ---------------------------------------------------------------------------
// Cache module-level pour guilds (et sous-cache pour channels par guild).
// TTL court (30s) pour éviter d'épuiser le quota Render et garder l'UI réactive.
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const GUILDS_TTL_MS = 30_000;
const CHANNELS_TTL_MS = 30_000;

let guildsCache: CacheEntry<{ id: string; name: string }[]> | null = null;
const channelsCache = new Map<string, CacheEntry<{ id: string; name: string }[]>>();

export function invalidateAtisCaches(): void {
  guildsCache = null;
  channelsCache.clear();
}

export async function getCachedGuilds(): Promise<{
  guilds: { id: string; name: string }[];
  error?: string;
  cached?: boolean;
}> {
  const now = Date.now();
  if (guildsCache && guildsCache.expiresAt > now) {
    return { guilds: guildsCache.value, cached: true };
  }
  const result = await fetchAtisBot<{ guilds: { id: string; name: string }[] }>(
    '/webhook/discord-guilds'
  );
  if (result.error || !result.data?.guilds) {
    return { guilds: [], error: result.error || 'Pas de réponse du bot' };
  }
  guildsCache = { value: result.data.guilds, expiresAt: now + GUILDS_TTL_MS };
  return { guilds: result.data.guilds };
}

export async function getCachedChannels(guildId: string): Promise<{
  channels: { id: string; name: string }[];
  error?: string;
  cached?: boolean;
}> {
  const now = Date.now();
  const existing = channelsCache.get(guildId);
  if (existing && existing.expiresAt > now) {
    return { channels: existing.value, cached: true };
  }
  const result = await fetchAtisBot<{ channels: { id: string; name: string }[] }>(
    `/webhook/discord-channels?guild_id=${encodeURIComponent(guildId)}`
  );
  if (result.error || !result.data?.channels) {
    return { channels: [], error: result.error || 'Pas de réponse du bot' };
  }
  channelsCache.set(guildId, { value: result.data.channels, expiresAt: now + CHANNELS_TTL_MS });
  return { channels: result.data.channels };
}

/**
 * Arrête le broadcast ATIS si l'utilisateur donné est le contrôleur.
 * Appelé quand un ATC se met hors service ou est déconnecté.
 *
 * En multi-instance : on cherche TOUTES les rows où l'utilisateur contrôle un ATIS,
 * et on arrête chacun de ces bots.
 */
export async function stopAtisIfController(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('atis_broadcast_state')
    .select('id, controlling_user_id')
    .eq('controlling_user_id', userId);

  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const instanceId = parseInt(String(row.id), 10);
    if (!Number.isFinite(instanceId)) continue;

    await fetchAtisBot('/webhook/stop', { method: 'POST', instanceId, timeoutMs: 8000 }).catch(
      (e) => console.error(`ATIS stop instance ${instanceId} on disconnect:`, e)
    );

    await admin
      .from('atis_broadcast_state')
      .update({
        controlling_user_id: null,
        aeroport: null,
        position: null,
        broadcasting: false,
        source: null,
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  }
}
