/**
 * Helper notifications.
 *
 * Crée une notification in-app dans la table `notifications` (cloche navbar)
 * et envoie optionnellement un DM Discord via le bot ATIS si l'utilisateur a
 * lié son compte Discord.
 *
 * À appeler depuis les routes API (serveur uniquement, utilise admin client).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAtisBot } from '@/lib/atis-bot-api';

export type NotificationType =
  | 'exam_request'
  | 'exam_accepted'
  | 'exam_started'
  | 'exam_passed'
  | 'exam_failed'
  | 'exam_reassigned_new'
  | 'exam_reassigned_old'
  | 'exam_unassigned'
  | 'exam_cancelled'
  | 'module_validated'
  | 'transfer_in'
  | 'transfer_out'
  | 'formation_done_eleve'
  | 'formation_done_admin';

export interface NotifyUserOptions {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** URL relative interne (ex: /instruction?tab=mes-eleves). */
  link?: string | null;
  /** Si false, ne crée que la notif in-app (pas de DM Discord). Default: true. */
  discordDm?: boolean;
}

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  ''
).replace(/\/$/, '');

/**
 * Convertit un lien relatif (ex: /instruction) en URL absolue pour l'inclure
 * dans un message Discord. Si SITE_URL n'est pas configure, retourne null
 * (le DM omettra alors le lien plutot que d'envoyer un chemin relatif casse).
 */
function absoluteUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  if (!SITE_URL) return null;
  const path = link.startsWith('/') ? link : `/${link}`;
  return `${SITE_URL}${path}`;
}

/**
 * Récupère le discord_user_id lié à un user_id (si lien actif).
 */
async function getDiscordIdForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('discord_links')
    .select('discord_user_id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  // On envoie tant que le compte n'est pas sanctionne (temporary_block / permanent_block).
  if (data.status === 'temporary_block' || data.status === 'permanent_block') {
    return null;
  }
  return data.discord_user_id ?? null;
}

/**
 * Envoie un DM Discord via le bot ATIS. Best-effort : ne throw jamais, log seulement.
 */
async function sendDiscordDM(
  discordUserId: string,
  payload: { title?: string | null; content: string; link?: string | null },
): Promise<void> {
  try {
    const res = await fetchAtisBot<{ ok?: boolean }>('/webhook/dm', {
      method: 'POST',
      body: {
        discord_user_id: discordUserId,
        title: payload.title ?? null,
        content: payload.content,
        link: payload.link ?? null,
      },
    });
    if (res.error) {
      // On log mais on ne fait pas échouer l'opération métier.
      console.warn(`[notifications] DM Discord echoue (${res.status}) pour ${discordUserId}: ${res.error}`);
    }
  } catch (e) {
    console.error('[notifications] sendDiscordDM error:', e);
  }
}

/**
 * Crée une notification in-app + envoie un DM Discord (si lié).
 *
 * Best-effort : si le bot Discord est indisponible, la notif in-app est quand
 * même créée. Ne throw jamais.
 */
export async function notifyUser(
  userId: string,
  options: NotifyUserOptions,
): Promise<void> {
  if (!userId) return;

  const admin = createAdminClient();

  // 1. Notification in-app
  try {
    const { error } = await admin.from('notifications').insert({
      user_id: userId,
      type: options.type,
      title: options.title.slice(0, 200),
      body: options.body ? options.body.slice(0, 2000) : null,
      link: options.link ?? null,
    });
    if (error) {
      console.error('[notifications] insert error:', error);
    }
  } catch (e) {
    console.error('[notifications] insert exception:', e);
  }

  // 2. DM Discord (best-effort, non bloquant)
  if (options.discordDm !== false) {
    const discordId = await getDiscordIdForUser(admin, userId);
    if (discordId) {
      const link = absoluteUrl(options.link);
      const content = options.body ?? '';
      await sendDiscordDM(discordId, {
        title: options.title,
        content,
        link,
      });
    }
  }
}

/**
 * Variante batch pour notifier plusieurs utilisateurs (par ex. tous les admins).
 */
export async function notifyUsers(
  userIds: string[],
  options: NotifyUserOptions,
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(unique.map((id) => notifyUser(id, options)));
}

/**
 * Récupère la liste des admins (pour les notifs systeme).
 */
export async function getAdminUserIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  if (error || !data) return [];
  return data.map((r) => r.id);
}
