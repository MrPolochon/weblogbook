export const DISCORD_OAUTH_STATE_COOKIE = 'discord_oauth_state';
export const DISCORD_OAUTH_RETURN_COOKIE = 'discord_oauth_return_to';

export type DiscordLinkStatus =
  | 'pending'
  | 'active'
  | 'missing_guild'
  | 'missing_role'
  | 'temporary_block'
  | 'permanent_block';

export interface DiscordLinkRow {
  user_id: string;
  discord_user_id: string;
  discord_username: string;
  discord_avatar: string | null;
  linked_at: string;
  guild_member: boolean;
  has_required_role: boolean;
  status: DiscordLinkStatus;
  sanction_type: string | null;
  sanction_reason: string | null;
  sanction_started_at: string | null;
  sanction_ends_at: string | null;
  is_permanent: boolean;
  last_sync_at: string | null;
  updated_at: string;
}

export function isDiscordLinkRequired() {
  return process.env.DISCORD_LINK_REQUIRED === 'true';
}

export function getDiscordGuildId() {
  return process.env.DISCORD_GUILD_ID?.trim() || '';
}

export function getDiscordRequiredRoleId() {
  return process.env.DISCORD_REQUIRED_ROLE_ID?.trim() || '';
}

export function getDiscordSyncSecret() {
  return process.env.DISCORD_SYNC_SECRET?.trim() || '';
}

export function getDiscordOAuthConfig() {
  return {
    clientId: process.env.DISCORD_CLIENT_ID?.trim() || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET?.trim() || '',
    redirectUri: process.env.DISCORD_REDIRECT_URI?.trim() || '',
  };
}

export function hasDiscordOAuthConfig() {
  const { clientId, clientSecret, redirectUri } = getDiscordOAuthConfig();
  return Boolean(clientId && clientSecret && redirectUri);
}

export function isTemporaryDiscordSanctionActive(link: Pick<DiscordLinkRow, 'status' | 'sanction_ends_at' | 'is_permanent'> | null | undefined) {
  if (!link || link.is_permanent) return false;
  if (link.status !== 'temporary_block') return false;
  if (!link.sanction_ends_at) return true;
  return new Date(link.sanction_ends_at).getTime() > Date.now();
}

export function deriveDiscordLinkStatus(input: {
  guild_member?: boolean | null;
  has_required_role?: boolean | null;
  is_permanent?: boolean | null;
  sanction_ends_at?: string | null;
}): DiscordLinkStatus {
  if (input.is_permanent) return 'permanent_block';
  if (input.sanction_ends_at && new Date(input.sanction_ends_at).getTime() > Date.now()) {
    return 'temporary_block';
  }
  if (input.guild_member === false) return 'missing_guild';
  if (input.has_required_role === false) return 'missing_role';
  return 'active';
}

export function getDiscordStatusMessage(link: DiscordLinkRow | null | undefined) {
  if (!link) {
    return 'Aucun compte Discord n’est encore lié à ce compte site.';
  }
  if (link.status === 'temporary_block') {
    return link.sanction_ends_at
      ? `Accès suspendu temporairement jusqu’au ${new Date(link.sanction_ends_at).toLocaleString('fr-FR')}.`
      : 'Accès suspendu temporairement par une sanction Discord.';
  }
  if (link.status === 'permanent_block') {
    return 'Ce compte Discord a reçu une exclusion définitive.';
  }
  if (link.status === 'missing_guild') {
    return 'Le compte Discord lié n’est plus présent sur le serveur Discord requis.';
  }
  if (link.status === 'missing_role') {
    return 'Le compte Discord lié ne possède plus le rôle Discord requis.';
  }
  return 'Compte Discord lié et valide.';
}
