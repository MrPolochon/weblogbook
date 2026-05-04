import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Endpoint utilisé par le bot ATIS (commande /find) pour retrouver l'identifiant
// du compte WebLogBook lié à un utilisateur Discord donné.
// Authentification : même secret partagé que /api/auth/webregister
//   - Authorization: Bearer <ATIS_WEBHOOK_SECRET>
//   - X-ATIS-Secret: <ATIS_WEBHOOK_SECRET>
//   - X-Webregister-Token: <WEBREGISTER_BOT_TOKEN> (fallback)
export async function GET(request: Request) {
  try {
    const atisSecret = process.env.ATIS_WEBHOOK_SECRET;
    const fallbackSecret = process.env.WEBREGISTER_BOT_TOKEN;
    if (!atisSecret && !fallbackSecret) {
      console.error('[find-by-discord] Aucun secret configuré (ATIS_WEBHOOK_SECRET ou WEBREGISTER_BOT_TOKEN)');
      return NextResponse.json({ error: 'Endpoint désactivé (configuration manquante).' }, { status: 503 });
    }

    const auth = request.headers.get('authorization');
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const xAtis = request.headers.get('x-atis-secret')?.trim() || null;
    const xWebreg = request.headers.get('x-webregister-token')?.trim() || null;
    const provided = bearer || xAtis || xWebreg;
    const isValid = Boolean(
      provided && (
        (atisSecret && provided === atisSecret) ||
        (fallbackSecret && provided === fallbackSecret)
      )
    );
    if (!isValid) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const url = new URL(request.url);
    const discordIdRaw = url.searchParams.get('discord_id')?.trim();
    if (!discordIdRaw) {
      return NextResponse.json({ error: 'discord_id requis' }, { status: 400 });
    }
    // Snowflake Discord : entier de 15 à 21 chiffres.
    if (!/^\d{15,21}$/.test(discordIdRaw)) {
      return NextResponse.json({ error: 'discord_id invalide' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: link, error: linkError } = await admin
      .from('discord_links')
      .select('user_id, discord_username, status')
      .eq('discord_user_id', discordIdRaw)
      .maybeSingle();

    if (linkError) {
      console.error('[find-by-discord] erreur lookup discord_links:', linkError);
      return NextResponse.json({ error: 'Erreur lors de la recherche' }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ found: false });
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', link.user_id)
      .maybeSingle();

    if (profileError) {
      console.error('[find-by-discord] erreur lookup profiles:', profileError);
      return NextResponse.json({ error: 'Erreur lors de la recherche' }, { status: 500 });
    }

    return NextResponse.json({
      found: true,
      identifiant: profile?.identifiant ?? null,
      discord_username: link.discord_username ?? null,
      status: link.status ?? null,
    });
  } catch (e) {
    console.error('find-by-discord error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
