import { createAdminClient } from '@/lib/supabase/admin';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
import { getDiscordRequiredRoleId } from '@/lib/discord-link';

const LOGIN_URL = '/login';

export type CreateDiscordAccountInput = {
  identifiant: string;
  password: string;
  discordId: string;
  discordUsername: string;
  discordAvatar?: string;
};

export type CreateDiscordAccountResult =
  | {
      ok: true;
      identifiant: string;
      message: string;
      login_url: string;
      login_identifiant: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      extra?: Record<string, unknown>;
    };

export function normalizeIdentifiant(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function normalizeDiscordId(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export function memberHasVerifiedRole(memberRoles: string[] | undefined | null): {
  ok: boolean;
  requiredRoleId: string;
} {
  const requiredRoleId = getDiscordRequiredRoleId();
  if (!requiredRoleId) return { ok: true, requiredRoleId: '' };
  const roles = (memberRoles || []).map(String);
  return { ok: roles.includes(requiredRoleId), requiredRoleId };
}

export async function createSiteAccountFromDiscord(
  input: CreateDiscordAccountInput
): Promise<CreateDiscordAccountResult> {
  const identifiant = String(input.identifiant || '').trim();
  const password = String(input.password || '');
  const discord_id = normalizeDiscordId(input.discordId);
  const discord_username = String(input.discordUsername || '').trim();
  const discord_avatar = String(input.discordAvatar || '').trim();

  if (!identifiant) {
    return {
      ok: false,
      status: 400,
      error: 'Identifiant manquant.',
      extra: { help: 'Indique l’identifiant souhaité pour le site.' },
    };
  }
  if (!password) {
    return {
      ok: false,
      status: 400,
      error: 'Mot de passe manquant.',
      extra: { help: 'Indique un mot de passe d’au moins 8 caractères.' },
    };
  }

  const id = normalizeIdentifiant(identifiant);
  if (id.length < 2) {
    return { ok: false, status: 400, error: 'Identifiant trop court (minimum 2 caractères).', extra: { normalized_identifiant: id } };
  }
  if (id.length > 30) {
    return { ok: false, status: 400, error: 'Identifiant trop long (maximum 30 caractères).', extra: { normalized_identifiant: id } };
  }
  if (password.length < 8) {
    return { ok: false, status: 400, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  }
  if (!discord_id) {
    return {
      ok: false,
      status: 400,
      error: 'Identité Discord introuvable.',
      extra: { help: 'Cette commande doit être exécutée depuis Discord.' },
    };
  }
  if (!/^\d{15,21}$/.test(discord_id)) {
    return { ok: false, status: 400, error: 'Identité Discord invalide.' };
  }
  if (!discord_username) {
    return { ok: false, status: 400, error: 'Nom Discord introuvable.' };
  }

  const admin = createAdminClient();

  const { data: existingLink } = await admin
    .from('discord_links')
    .select('user_id, discord_username')
    .eq('discord_user_id', discord_id)
    .maybeSingle();

  if (existingLink) {
    const { data: linkedProfile } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', existingLink.user_id)
      .maybeSingle();
    const linkedIdentifiant = linkedProfile?.identifiant ?? null;
    if (!linkedIdentifiant) {
      await admin.from('discord_links').delete().eq('discord_user_id', discord_id);
    } else {
      return {
        ok: false,
        status: 409,
        error: 'Ce compte Discord est déjà lié à un compte WebLogBook.',
        extra: {
          already_linked: true,
          identifiant: linkedIdentifiant,
          message: `Ton Discord est déjà relié au compte "${linkedIdentifiant}". Connecte-toi sur le site avec cet identifiant au lieu de recréer un compte.`,
          login_url: LOGIN_URL,
        },
      };
    }
  }

  const { data: existingProfile } = await admin.from('profiles').select('id').eq('identifiant', id).maybeSingle();
  if (existingProfile) {
    return {
      ok: false,
      status: 400,
      error: 'Cet identifiant est déjà utilisé.',
      extra: { normalized_identifiant: id, help: 'Choisis un autre identifiant et relance /register.' },
    };
  }

  const email = identifiantToEmail(id);
  const { data: u, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    if (createErr.message?.includes('already been registered')) {
      return { ok: false, status: 400, error: 'Cet identifiant est déjà utilisé.', extra: { normalized_identifiant: id } };
    }
    return { ok: false, status: 400, error: createErr.message || 'Erreur lors de la création du compte.' };
  }
  if (!u?.user?.id) {
    return { ok: false, status: 500, error: 'Erreur lors de la création du compte.' };
  }

  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: u.user.id,
      identifiant: id,
      role: 'pilote',
      armee: false,
      atc: false,
      heures_initiales_minutes: 0,
    },
    { onConflict: 'id' }
  );

  if (profileErr) {
    await admin.auth.admin.deleteUser(u.user.id);
    if (profileErr.code === '23505' && String(profileErr.message || '').includes('identifiant')) {
      return { ok: false, status: 400, error: 'Cet identifiant est déjà utilisé par un autre compte.' };
    }
    return { ok: false, status: 500, error: profileErr.message || 'Erreur lors de la création du profil.' };
  }

  const { data: felitzExistants } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', u.user.id)
    .eq('type', 'personnel');

  if (!felitzExistants || felitzExistants.length === 0) {
    await ensureComptePersonnel(admin, u.user.id);
  }

  const { error: linkErr } = await admin.from('discord_links').insert({
    user_id: u.user.id,
    discord_user_id: discord_id,
    discord_username,
    discord_avatar: discord_avatar || null,
    guild_member: true,
    has_required_role: true,
    status: 'active',
  });
  if (linkErr) {
    await admin.auth.admin.deleteUser(u.user.id);
    return { ok: false, status: 500, error: linkErr.message || 'Erreur lors de la liaison Discord.' };
  }

  return {
    ok: true,
    identifiant: id,
    login_identifiant: id,
    login_url: LOGIN_URL,
    message: `Compte créé pour ${id}. Ton Discord est déjà lié. Connecte-toi sur le site avec l’identifiant "${id}" et le mot de passe que tu viens de choisir.`,
  };
}
