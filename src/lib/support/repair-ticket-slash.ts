import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import {
  DISCORD_TICKET_ALLOW,
  discordPutChannelOverwrite,
  isDiscordRateLimit,
} from '@/lib/support/discord-api';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recolle USE_APPLICATION_COMMANDS sur les tickets ouverts.
 * Les salons créés avant le fix (allow=117760) masquaient /register aux membres.
 */
export async function repairOpenTicketSlashAccess(): Promise<{ repaired: number; failed: number }> {
  const cfg = await getSupportConfig();
  const admin = createAdminClient();
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('channel_id, discord_user_id')
    .is('closed_at', null);

  let repaired = 0;
  let failed = 0;
  const rows = tickets || [];

  for (const t of rows) {
    const channelId = String(t.channel_id || '');
    const userId = String(t.discord_user_id || '');
    if (!channelId || !userId) continue;
    try {
      await discordPutChannelOverwrite(channelId, userId, {
        type: 1,
        allow: DISCORD_TICKET_ALLOW,
        deny: '0',
      });
      if (cfg?.staff_role_id) {
        await discordPutChannelOverwrite(channelId, String(cfg.staff_role_id), {
          type: 0,
          allow: DISCORD_TICKET_ALLOW,
          deny: '0',
        });
      }
      repaired += 1;
    } catch (e) {
      if (isDiscordRateLimit(e)) {
        const wait = Math.max(1500, (e as { retryAfterMs?: number }).retryAfterMs || 1500);
        await sleep(wait);
        try {
          await discordPutChannelOverwrite(channelId, userId, {
            type: 1,
            allow: DISCORD_TICKET_ALLOW,
            deny: '0',
          });
          repaired += 1;
          continue;
        } catch {
          failed += 1;
          continue;
        }
      }
      failed += 1;
    }
  }

  return { repaired, failed };
}
