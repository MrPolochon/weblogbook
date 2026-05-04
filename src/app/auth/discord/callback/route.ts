import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DISCORD_OAUTH_RETURN_COOKIE,
  DISCORD_OAUTH_STATE_COOKIE,
  getDiscordOAuthConfig,
  hasDiscordOAuthConfig,
} from '@/lib/discord-link';
import { refreshDiscordLinkState, upsertDiscordLinkState } from '@/lib/discord-link-service';

export const dynamic = 'force-dynamic';

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  avatar: string | null;
  global_name?: string | null;
};

function clearDiscordCookies(response: NextResponse) {
  response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(DISCORD_OAUTH_RETURN_COOKIE, '', { path: '/', maxAge: 0 });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');

  const redirectWithError = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/discord-obligatoire?error=${reason}`, request.url));
    clearDiscordCookies(res);
    return res;
  };

  if (error) return redirectWithError('oauth_error');
  if (!code || !state) return redirectWithError('oauth_invalid');
  if (!hasDiscordOAuthConfig()) return redirectWithError('oauth_missing');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(DISCORD_OAUTH_STATE_COOKIE)?.value;
  const cookieReturnTo = cookieStore.get(DISCORD_OAUTH_RETURN_COOKIE)?.value || '/discord-obligatoire';
  // Empêche les open redirects : '//attaquant.com' commence par '/' mais résout sur un autre host.
  const isSafeInternalPath = (p: string) =>
    typeof p === 'string' &&
    p.startsWith('/') &&
    !p.startsWith('//') &&
    !p.startsWith('/\\') &&
    !p.includes('\\');
  const returnTo = isSafeInternalPath(cookieReturnTo) ? cookieReturnTo : '/discord-obligatoire';
  if (!expectedState || expectedState !== state) return redirectWithError('state_mismatch');

  try {
    const { clientId, clientSecret, redirectUri } = getDiscordOAuthConfig();
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      cache: 'no-store',
    });
    const tokenData = (await tokenRes.json().catch(() => ({}))) as Partial<DiscordTokenResponse>;
    if (!tokenRes.ok || !tokenData.access_token) {
      return redirectWithError('token_exchange');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: 'no-store',
    });
    const discordUser = (await userRes.json().catch(() => ({}))) as Partial<DiscordUserResponse>;
    if (!userRes.ok || !discordUser.id || !discordUser.username) {
      return redirectWithError('discord_user');
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('discord_links')
      .select('user_id')
      .eq('discord_user_id', discordUser.id)
      .maybeSingle();

    if (existing?.user_id && existing.user_id !== user.id) {
      return redirectWithError('already_linked');
    }

    await upsertDiscordLinkState(user.id, {
      discord_user_id: discordUser.id,
      discord_username: discordUser.global_name || discordUser.username,
      discord_avatar: discordUser.avatar ?? null,
      guild_member: false,
      has_required_role: false,
      linked_at: new Date().toISOString(),
      last_sync_at: null,
    });

    await refreshDiscordLinkState(user.id);

    const res = NextResponse.redirect(new URL(returnTo, request.url));
    clearDiscordCookies(res);
    return res;
  } catch (callbackError) {
    console.error('Discord OAuth callback error:', callbackError);
    return redirectWithError('server');
  }
}
