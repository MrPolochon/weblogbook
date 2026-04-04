import { createAdminClient } from '@/lib/supabase/admin';
import { deleteUserAccount } from '@/lib/delete-user';
import { fetchDiscordBot } from '@/lib/discord-bot-api';
import {
  deriveDiscordLinkStatus,
  getDiscordGuildId,
  getDiscordRequiredRoleId,
  type DiscordLinkRow,
} from '@/lib/discord-link';

type DiscordStateInput = {
  discord_user_id?: string;
  discord_username?: string;
  discord_avatar?: string | null;
  guild_member?: boolean;
  has_required_role?: boolean;
  sanction_type?: string | null;
  sanction_reason?: string | null;
  sanction_started_at?: string | null;
  sanction_ends_at?: string | null;
  is_permanent?: boolean;
  linked_at?: string;
  last_sync_at?: string | null;
};

type BotMemberStatus = {
  guild_member: boolean;
  has_required_role: boolean;
  username?: string | null;
  avatar?: string | null;
  sanction_type?: string | null;
  sanction_reason?: string | null;
  sanction_started_at?: string | null;
  sanction_ends_at?: string | null;
  is_permanent?: boolean;
};

function buildStatusPayload(userId: string, input: DiscordStateInput) {
  const lastSyncAt = input.last_sync_at ?? new Date().toISOString();
  return {
    user_id: userId,
    discord_user_id: input.discord_user_id,
    discord_username: input.discord_username,
    discord_avatar: input.discord_avatar ?? null,
    linked_at: input.linked_at ?? new Date().toISOString(),
    guild_member: input.guild_member ?? false,
    has_required_role: input.has_required_role ?? false,
    sanction_type: input.sanction_type ?? null,
    sanction_reason: input.sanction_reason ?? null,
    sanction_started_at: input.sanction_started_at ?? null,
    sanction_ends_at: input.sanction_ends_at ?? null,
    is_permanent: Boolean(input.is_permanent),
    last_sync_at: lastSyncAt,
    status: deriveDiscordLinkStatus({
      guild_member: input.guild_member ?? false,
      has_required_role: input.has_required_role ?? false,
      is_permanent: Boolean(input.is_permanent),
      sanction_ends_at: input.sanction_ends_at ?? null,
    }),
    updated_at: new Date().toISOString(),
  };
}

export async function getDiscordLinkForUser(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('discord_links')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return (data as DiscordLinkRow | null) ?? null;
}

async function syncProfileBlockState(userId: string, status: DiscordLinkRow['status'], sanctionEndsAt: string | null, sanctionType: string | null) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('blocked_until, block_reason')
    .eq('id', userId)
    .maybeSingle();

  const currentReason = profile?.block_reason ?? '';
  const isDiscordBlock = currentReason.startsWith('DISCORD:');

  if (status === 'temporary_block') {
    await admin
      .from('profiles')
      .update({
        blocked_until: sanctionEndsAt,
        block_reason: `DISCORD:${sanctionType || 'sanction_temporaire'}`,
      })
      .eq('id', userId);
    return;
  }

  if (isDiscordBlock) {
    await admin
      .from('profiles')
      .update({
        blocked_until: null,
        block_reason: null,
      })
      .eq('id', userId);
  }
}

export async function upsertDiscordLinkState(userId: string, input: DiscordStateInput) {
  const admin = createAdminClient();
  const existing = await getDiscordLinkForUser(userId);
  const payload = buildStatusPayload(userId, {
    discord_user_id: input.discord_user_id ?? existing?.discord_user_id,
    discord_username: input.discord_username ?? existing?.discord_username,
    discord_avatar: input.discord_avatar ?? existing?.discord_avatar ?? null,
    linked_at: existing?.linked_at ?? input.linked_at,
    guild_member: input.guild_member ?? existing?.guild_member ?? false,
    has_required_role: input.has_required_role ?? existing?.has_required_role ?? false,
    sanction_type: input.sanction_type ?? null,
    sanction_reason: input.sanction_reason ?? null,
    sanction_started_at: input.sanction_started_at ?? null,
    sanction_ends_at: input.sanction_ends_at ?? null,
    is_permanent: input.is_permanent ?? false,
    last_sync_at: input.last_sync_at,
  });

  const { data, error } = await admin
    .from('discord_links')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;

  const row = data as DiscordLinkRow;
  await syncProfileBlockState(userId, row.status, row.sanction_ends_at, row.sanction_type);

  if (row.status === 'permanent_block') {
    await deleteUserAccount(userId);
    return null;
  }

  return row;
}

export async function refreshDiscordLinkState(userId: string) {
  const link = await getDiscordLinkForUser(userId);
  if (!link?.discord_user_id) return link;

  const guildId = getDiscordGuildId();
  const requiredRoleId = getDiscordRequiredRoleId();
  /**
   * Sans guilde + rôle requis, ou sans bot ATIS : on ne peut pas valider la présence sur le serveur.
   * Après OAuth, laisser « missing_guild » bloquait l’utilisateur indéfiniment (middleware).
   * Dans ce cas, considérer la liaison Discord « identify » comme suffisante pour débloquer l’accès.
   */
  const oauthOnlyActive = async () =>
    upsertDiscordLinkState(userId, {
      discord_user_id: link.discord_user_id,
      discord_username: link.discord_username,
      discord_avatar: link.discord_avatar,
      guild_member: true,
      has_required_role: true,
      last_sync_at: new Date().toISOString(),
    });

  if (!guildId || !requiredRoleId) {
    return oauthOnlyActive();
  }

  const query = new URLSearchParams({
    guild_id: guildId,
    user_id: link.discord_user_id,
    required_role_id: requiredRoleId,
  });
  const result = await fetchDiscordBot<BotMemberStatus>(`/webhook/discord-member-status?${query.toString()}`);
  if (!result.data) {
    const botUnconfigured =
      result.status === 503 && result.error === 'Bot Discord non configuré';
    if (botUnconfigured) {
      return oauthOnlyActive();
    }
    return link;
  }

  return upsertDiscordLinkState(userId, {
    discord_user_id: link.discord_user_id,
    discord_username: result.data.username ?? link.discord_username,
    discord_avatar: result.data.avatar ?? link.discord_avatar,
    guild_member: result.data.guild_member,
    has_required_role: result.data.has_required_role,
    sanction_type: result.data.sanction_type ?? null,
    sanction_reason: result.data.sanction_reason ?? null,
    sanction_started_at: result.data.sanction_started_at ?? null,
    sanction_ends_at: result.data.sanction_ends_at ?? null,
    is_permanent: Boolean(result.data.is_permanent),
    last_sync_at: new Date().toISOString(),
  });
}
