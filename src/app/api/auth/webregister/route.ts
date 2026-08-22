import { NextResponse } from 'next/server';
import { createSiteAccountFromDiscord } from '@/lib/auth/create-discord-account';

export const dynamic = 'force-dynamic';

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
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

export async function POST(request: Request) {
  try {
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
      provided && ((atisSecret && provided === atisSecret) || (fallbackSecret && provided === fallbackSecret))
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

    const result = await createSiteAccountFromDiscord({
      identifiant: readString(body, ['identifiant', 'identifiant_site', 'site_identifiant', 'username', 'pseudo', 'login']),
      password: readString(body, ['password', 'mot_de_passe', 'motdepasse', 'site_password', 'sitePassword']),
      discordId: readString(body, [
        'discord_id',
        'discordId',
        'discord_user_id',
        'discordUserId',
        'user_id',
        'userId',
        'discord_mention',
        'discordMention',
      ]),
      discordUsername: readString(body, [
        'discord_username',
        'discordUsername',
        'username_discord',
        'global_name',
        'globalName',
        'display_name',
        'displayName',
        'tag',
        'discord_tag',
      ]),
      discordAvatar: readString(body, ['discord_avatar', 'discordAvatar', 'avatar']),
    });

    if (!result.ok) {
      return jsonError(result.error, result.status, result.extra);
    }

    return NextResponse.json({
      ok: true,
      identifiant: result.identifiant,
      discord_linked: true,
      message: result.message,
      login_url: result.login_url,
      login_identifiant: result.login_identifiant,
      next_step: 'Se connecter sur le site',
      instructions: [
        'Ouvre la page de connexion du site.',
        `Saisis l’identifiant "${result.identifiant}".`,
        'Entre le mot de passe choisi dans la commande /register.',
      ],
    });
  } catch (e) {
    console.error('webregister error:', e);
    return jsonError('Erreur serveur.', 500);
  }
}
