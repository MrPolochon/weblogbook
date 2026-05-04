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
}

/**
 * Construit le chemin final pour appeler le bot, en injectant l'instance_id si fourni.
 * Path doit commencer par "/webhook/...". Si instanceId est fourni, on ajoute /webhook/<id>/...
 */
function buildPath(path: string, instanceId?: number): string {
  if (!instanceId) return path;
  // Retire le préfixe /webhook s'il y en a un, puis le préfixe par /webhook/<id>
  const stripped = path.replace(/^\/webhook/, '');
  return `/webhook/${instanceId}${stripped}`;
}

export async function fetchAtisBot<T>(
  path: string,
  options?: FetchAtisBotOptions
): Promise<{ data?: T; error?: string; status: number }> {
  const url = getBotUrl();
  if (!url || !getSecret()) {
    return { error: 'Bot ATIS non configuré', status: 503 };
  }
  const finalPath = buildPath(path, options?.instanceId);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s pour cold start Render
    const res = await fetch(`${url}${finalPath}`, {
      method: options?.method ?? 'GET',
      headers: headers(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error ||
        (res.status === 401
          ? 'Secret incorrect (ATIS_WEBHOOK_SECRET)'
          : res.status === 503
            ? 'Bot non prêt ou webhook non configuré'
            : `Erreur ${res.status}`);
      return { error: msg, status: res.status };
    }
    return { data, status: res.status };
  } catch (e) {
    console.error('ATIS bot fetch:', e);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    return {
      error: isTimeout
        ? 'Délai dépassé (le bot Render démarre peut-être, réessayez dans 1 min)'
        : 'Erreur de connexion au bot',
      status: 500,
    };
  }
}

/**
 * Récupère le 1er bot disponible (non broadcasting). Retourne son instance_id ou null.
 * Utilisé pour l'auto-assign d'un bot lors du démarrage d'un ATIS depuis le site.
 */
export async function getAvailableBotInstance(): Promise<{ instance_id: number | null; error?: string }> {
  const result = await fetchAtisBot<{ instance_id: number | null; available: boolean }>('/webhook/available');
  if (result.error) return { instance_id: null, error: result.error };
  return { instance_id: result.data?.instance_id ?? null };
}

/**
 * Récupère l'état de toutes les instances de bot.
 * Renvoie un tableau d'objets { instance_id, broadcasting, atis_text, ... }.
 */
export interface BotInstanceStatus {
  instance_id: number;
  broadcasting: boolean;
  atis_text?: string | null;
  airport?: string | null;
  channel?: string | null;
  atis_code?: string | null;
  bilingual?: boolean;
}

export async function getAllBotStatuses(): Promise<{
  instances: BotInstanceStatus[];
  error?: string;
}> {
  const result = await fetchAtisBot<{ instances: BotInstanceStatus[] }>('/webhook/status-all');
  if (result.error) return { instances: [], error: result.error };
  return { instances: result.data?.instances ?? [] };
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

  const botUrl = getBotUrl();
  const secret = getSecret();

  for (const row of rows) {
    const instanceId = parseInt(String(row.id), 10);
    if (!Number.isFinite(instanceId)) continue;

    if (botUrl && secret) {
      await fetch(`${botUrl}/webhook/${instanceId}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'X-ATIS-Secret': secret },
      }).catch((e) => console.error(`ATIS stop instance ${instanceId} on disconnect:`, e));
    }

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
