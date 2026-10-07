import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { hasDiscordOAuthConfig, getDiscordOAuthConfig, DISCORD_OAUTH_STATE_COOKIE, DISCORD_OAUTH_RETURN_COOKIE } from '@/lib/discord-link';
import { getClientIp } from '@/lib/ip-utils';
import { rateLimitShared } from '@/lib/rate-limit-shared';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!hasDiscordOAuthConfig()) return NextResponse.redirect(new URL('/login?message=discord-unavailable',req.url));
  if (!(await rateLimitShared(`discord-login:${getClientIp(req) ?? 'unknown'}`,20,900000)).allowed) return NextResponse.json({error:'Trop de tentatives.'},{status:429});
  const state = randomBytes(32).toString('hex');
  const config = getDiscordOAuthConfig();
  const params = new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'identify',state});
  const res = NextResponse.redirect('https://discord.com/oauth2/authorize?'+params);
  const cookieOptions = {httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax' as const,path:'/',maxAge:300};
  res.cookies.set(DISCORD_OAUTH_STATE_COOKIE,state,cookieOptions);
  res.cookies.set(DISCORD_OAUTH_RETURN_COOKIE,'/login?step=verify',cookieOptions);
  res.cookies.set('discord_oauth_login','1',cookieOptions);
  return res;
}
