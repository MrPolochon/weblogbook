import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DISCORD_OAUTH_RETURN_COOKIE,
  DISCORD_OAUTH_STATE_COOKIE,
  getDiscordOAuthConfig,
  hasDiscordOAuthConfig,
} from '@/lib/discord-link';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!hasDiscordOAuthConfig()) {
    return NextResponse.redirect(new URL('/discord-obligatoire?error=oauth_missing', request.url));
  }

  const { clientId, redirectUri } = getDiscordOAuthConfig();
  const state = randomBytes(24).toString('hex');
  const requestUrl = new URL(request.url);
  const requestedReturnTo = requestUrl.searchParams.get('returnTo') || '/discord-obligatoire';
  const returnTo = requestedReturnTo.startsWith('/') ? requestedReturnTo : '/discord-obligatoire';

  const discordUrl = new URL('https://discord.com/oauth2/authorize');
  discordUrl.searchParams.set('client_id', clientId);
  discordUrl.searchParams.set('response_type', 'code');
  discordUrl.searchParams.set('redirect_uri', redirectUri);
  discordUrl.searchParams.set('scope', 'identify');
  discordUrl.searchParams.set('state', state);
  discordUrl.searchParams.set('prompt', 'consent');

  const response = NextResponse.redirect(discordUrl);
  response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  response.cookies.set(DISCORD_OAUTH_RETURN_COOKIE, returnTo, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return response;
}
