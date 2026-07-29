import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';

export const dynamic = 'force-dynamic';

const LOGIN_URL = '/login';

function jsonError(
  error: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...extra,
    },
    { status }
  );
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  return await request.json();
}

function readString(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeDiscordId(raw: string): string {
  // Accepte un snowflake brut ou une mention Discord (<@123>, <@!123>).
  return raw.replace(/\D/g, '');
}

export async function POST(request: Request) {
  try {
    // Authentification du bot ATIS via le secret partagé déjà existant
    // ATIS_WEBHOOK_SECRET (le bot l'envoie déjà via "Authorization: Bearer <secret>"
    // ou "X-ATIS-Secret: <secret>" pour les autres endpoints comme /api/atc/atis/bot-sync).
    // On accepte aussi WEBREGISTER_BOT_TOKEN si défini pour rétrocompatibilité / autre bot.
    const atisSecret = process.env.ATIS_WEBHOOK_SECRET;
    const fallbackSecret = process.env.WEBREGISTER_BOT_TOKEN;
    if (!atisSecret && !fallbackSecret) {
      console.error('[webregister] Aucun secret configuré (ATIS_WEBHOOK_SECRET ou WEBREGISTER_BOT_TOKEN)');
      return jsonError('Inscription Discord indisponible pour le moment (configuration manquante).', 503);
    }
    const auth = request.headers.get('authorization');
    const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
    const xAtis = request.headers.get('x-atis-secret')?.trim() || null;
    const xWebreg = request.headers.get('x-webregister-token')?.trim() || null;
    const xWebregSecret = request.headers.get('x-webregister-secret')?.trim() || null;
    const xBotSecret = request.headers.get('x-bot-secret')?.trim() || null;
    const provided = bearer || xAtis || xWebreg || xWebregSecret || xBotSecret;
    const isValid = Boolean(
      provided && (
        (atisSecret && provided === atisSecret) ||
        (fallbackSecret && provided === fallbackSecret)
      )
    );
    if (!isValid) {
      return jsonError('Non autorisé', 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      return jsonError('Corps de requête invalide. Envoyez du JSON ou un formulaire.', 400);
    }

    const identifiant = readString(body, ['identifiant', 'identifiant_site', 'site_identifiant', 'username', 'pseudo', 'login']);
    const password = readString(body, ['password', 'mot_de_passe', 'motdepasse', 'site_password', 'sitePassword']);
    const discordIdRaw = readString(body, ['discord_id', 'discordId', 'discord_user_id', 'discordUserId', 'user_id', 'userId', 'discord_mention', 'discordMention']);
    const discord_id = normalizeDiscordId(discordIdRaw);
    const discord_username = readString(body, ['discord_username', 'discordUsername', 'username_discord', 'global_name', 'globalName', 'display_name', 'displayName', 'tag', 'discord_tag']);
    const discord_avatar = readString(body, ['discord_avatar', 'discordAvatar', 'avatar']);

    if (!identifiant) {
      return jsonError('Identifiant manquant.', 400, {
        help: 'Indiquez l’identifiant souhaité pour le site WebLogBook.',
        example: '/register identifiant:monpseudo mot_de_passe:********',
      });
    }
    if (!password) {
      return jsonError('Mot de passe manquant.', 400, {
        help: 'Indiquez un mot de passe d’au moins 8 caractères pour votre nouveau compte site.',
      });
    }

    const id = String(identifiant).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (id.length < 2) {
      return jsonError('Identifiant trop court (minimum 2 caractères).', 400, {
        normalized_identifiant: id,
      });
    }
    if (id.length > 30) {
      return jsonError('Identifiant trop long (maximum 30 caractères).', 400, {
        normalized_identifiant: id,
      });
    }
    if (password.length < 8) {
      return jsonError('Le mot de passe doit faire au moins 8 caractères.', 400);
    }

    if (!discord_id) {
      return jsonError('Identité Discord introuvable.', 400, {
        help: 'Cette commande doit être exécutée directement depuis Discord afin que le bot puisse récupérer votre compte.',
      });
    }
    if (!/^\d{15,21}$/.test(discord_id)) {
      return jsonError('Identité Discord invalide (snowflake Discord attendu).', 400);
    }
    if (!discord_username) {
      return jsonError('Nom Discord introuvable.', 400, {
        help: 'Le bot doit transmettre votre pseudo Discord pour finaliser la liaison.',
      });
    }

    const admin = createAdminClient();

    // Un seul compte par utilisateur Discord
    const { data: existingLink } = await admin
      .from('discord_links')
      .select('user_id, discord_username')
      .eq('discord_user_id', discord_id)
      .maybeSingle();

    if (existingLink) {
      // Récupère l'identifiant du compte déjà lié pour pouvoir le rappeler à l'utilisateur.
      const { data: linkedProfile } = await admin
        .from('profiles')
        .select('identifiant')
        .eq('id', existingLink.user_id)
        .maybeSingle();
      const linkedIdentifiant = linkedProfile?.identifiant ?? null;
      if (!linkedIdentifiant) {
        // Lien orphelin historique : on le libère pour permettre la commande.
        await admin.from('discord_links').delete().eq('discord_user_id', discord_id);
      } else {
        return jsonError('Ce compte Discord est déjà lié à un compte WebLogBook.', 409, {
          already_linked: true,
          identifiant: linkedIdentifiant,
          message: `Ton Discord est déjà relié au compte "${linkedIdentifiant}". Connecte-toi sur le site avec cet identifiant au lieu de recréer un compte.`,
          login_url: LOGIN_URL,
        });
      }
    }

    // Verifier si l'identifiant est deja pris
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('identifiant', id)
      .maybeSingle();

    if (existingProfile) {
      return jsonError('Cet identifiant est déjà utilisé.', 400, {
        normalized_identifiant: id,
        help: 'Choisissez un autre identifiant et relancez /register.',
      });
    }

    const email = identifiantToEmail(id);

    const { data: u, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      if (createErr.message?.includes('already been registered')) {
        return jsonError('Cet identifiant est déjà utilisé.', 400, {
          normalized_identifiant: id,
        });
      }
      return jsonError(createErr.message || 'Erreur lors de la création du compte.', 400);
    }
    if (!u?.user?.id) {
      return jsonError('Erreur lors de la création du compte.', 500);
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: u.user.id,
      identifiant: id,
      role: 'pilote',
      armee: false,
      atc: false,
      heures_initiales_minutes: 0,
    }, { onConflict: 'id' });

    if (profileErr) {
      await admin.auth.admin.deleteUser(u.user.id);
      if (profileErr.code === '23505' && String(profileErr.message || '').includes('identifiant')) {
        return jsonError('Cet identifiant est déjà utilisé par un autre compte.', 400, {
          normalized_identifiant: id,
        });
      }
      return jsonError(profileErr.message || 'Erreur lors de la création du profil.', 500);
    }

    // Creer le compte Felitz Bank
    const { data: felitzExistants } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', u.user.id)
      .eq('type', 'personnel');

    if (!felitzExistants || felitzExistants.length === 0) {
      await ensureComptePersonnel(admin, u.user.id);
    }

    // Lier le Discord automatiquement
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
      return jsonError(linkErr.message || 'Erreur lors de la liaison Discord.', 500);
    }

    return NextResponse.json({
      ok: true,
      identifiant: id,
      discord_linked: true,
      message: `Compte créé pour ${id}. Ton Discord est déjà lié. Connecte-toi maintenant sur le site avec l’identifiant "${id}" et le mot de passe que tu viens de choisir.`,
      login_url: LOGIN_URL,
      login_identifiant: id,
      next_step: 'Se connecter sur le site',
      instructions: [
        'Ouvre la page de connexion du site.',
        `Saisis l’identifiant "${id}".`,
        'Entre le mot de passe choisi dans la commande /register.',
      ],
    });
  } catch (e) {
    console.error('webregister error:', e);
    return jsonError('Erreur serveur.', 500);
  }
}
