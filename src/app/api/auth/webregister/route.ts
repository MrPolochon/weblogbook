import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ error: 'Endpoint désactivé (configuration manquante).' }, { status: 503 });
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
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide. Envoyez du JSON ou un formulaire.' }, { status: 400 });
    }

    const identifiant = readString(body, ['identifiant', 'username', 'pseudo', 'login']);
    const password = readString(body, ['password', 'mot_de_passe', 'motdepasse']);
    const discordIdRaw = readString(body, ['discord_id', 'discordId', 'discord_user_id', 'discordUserId', 'user_id', 'userId']);
    const discord_id = normalizeDiscordId(discordIdRaw);
    const discord_username = readString(body, ['discord_username', 'discordUsername', 'username_discord', 'global_name', 'globalName', 'display_name', 'displayName', 'tag']);
    const discord_avatar = readString(body, ['discord_avatar', 'discordAvatar', 'avatar']);

    if (!identifiant) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 });
    }

    const id = String(identifiant).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (id.length < 2) {
      return NextResponse.json({ error: 'Identifiant trop court (minimum 2 caracteres)' }, { status: 400 });
    }
    if (id.length > 30) {
      return NextResponse.json({ error: 'Identifiant trop long (maximum 30 caracteres)' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caracteres' }, { status: 400 });
    }

    if (!discord_id) {
      return NextResponse.json({ error: 'discord_id requis' }, { status: 400 });
    }
    if (!/^\d{15,21}$/.test(discord_id)) {
      return NextResponse.json({ error: 'discord_id invalide (snowflake Discord attendu)' }, { status: 400 });
    }
    if (!discord_username) {
      return NextResponse.json({ error: 'discord_username requis' }, { status: 400 });
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
        return NextResponse.json({
          error: 'Un compte est deja enregistre avec ce compte Discord.',
          already_linked: true,
          identifiant: linkedIdentifiant,
        }, { status: 409 });
      }
    }

    // Verifier si l'identifiant est deja pris
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('identifiant', id)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ error: 'Cet identifiant est deja utilise' }, { status: 400 });
    }

    const email = identifiantToEmail(id);

    const { data: u, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      if (createErr.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'Cet identifiant est deja utilise' }, { status: 400 });
      }
      return NextResponse.json({ error: createErr.message || 'Erreur creation' }, { status: 400 });
    }
    if (!u?.user?.id) {
      return NextResponse.json({ error: 'Erreur creation' }, { status: 500 });
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
        return NextResponse.json({ error: 'Cet identifiant est deja utilise par un autre compte.' }, { status: 400 });
      }
      return NextResponse.json({ error: profileErr.message || 'Erreur creation profil' }, { status: 500 });
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
      return NextResponse.json({ error: linkErr.message || 'Erreur liaison Discord' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      identifiant: id,
      discord_linked: true,
      message: `Compte cree pour ${id}. Discord lie automatiquement. Connecte-toi sur le site avec l'identifiant "${id}" et ton mot de passe.`,
    });
  } catch (e) {
    console.error('webregister error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
