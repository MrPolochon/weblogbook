import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDiscordLinkRequired, isTemporaryDiscordSanctionActive, type DiscordLinkStatus } from '@/lib/discord-link';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isDownload = pathname === '/download';
  const isAeroSchool = pathname.startsWith('/aeroschool');
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic = pathname === '/api/setup' || pathname === '/api/has-admin' || pathname === '/api/site-config';
  const isApiDiscord = pathname.startsWith('/api/discord/');
  const isApiAeroSchoolPublic = pathname.startsWith('/api/aeroschool/') && request.method !== 'PUT' && request.method !== 'DELETE';
  const isDiscordRequiredPage = pathname === '/discord-obligatoire';
  const isApiAuth = pathname.startsWith('/api/auth/');

  if (request.method === 'OPTIONS') {
    return NextResponse.next({ request });
  }

  const authHeader = request.headers.get('authorization');
  if (pathname.startsWith('/api/') && authHeader?.startsWith('Bearer ')) {
    return NextResponse.next({ request });
  }

  const isCarteAtc = pathname === '/carte-atc';
  const isApiAtcOnline = pathname === '/api/atc/online';

  if (isAuthCallback || isApiPublic || isApiDiscord || isApiAeroSchoolPublic || isApiAuth || isSetup || isLogin || isDownload || isAeroSchool || isCarteAtc || isApiAtcOnline) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { path: '/', ...options })
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const pendingVerification = request.cookies.get('pending_login_verification')?.value;
  if (pendingVerification && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('step', 'verify');
    return NextResponse.redirect(url);
  }

  // All DB checks in a single parallel batch instead of sequential
  const admin = createAdminClient();
  const discordRequired = isDiscordLinkRequired();

  const [securityResult, siteConfigResult, discordResult] = await Promise.all([
    // 1) Security logout check
    Promise.resolve(admin.from('security_logout').select('user_id').eq('user_id', user.id).maybeSingle()).catch(() => ({ data: null })),

    // 2) Site config (admin-only login)
    Promise.resolve(admin.from('site_config').select('login_admin_only').eq('id', 1).maybeSingle()).catch(() => ({ data: null })),

    // 3) Discord + profile blocked (only if discord required)
    discordRequired
      ? Promise.all([
          admin.from('profiles').select('role, blocked_until, block_reason').eq('id', user.id).maybeSingle(),
          admin.from('discord_links')
            .select('discord_user_id, status, sanction_ends_at, is_permanent, guild_member, has_required_role')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]).catch(() => [{ data: null }, { data: null }] as const)
      : Promise.resolve(null),
  ]);

  // Handle security logout
  const logoutRow = (securityResult as { data: { user_id: string } | null })?.data;
  if (logoutRow) {
    await admin.from('security_logout').delete().eq('user_id', user.id);
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('message', 'security_logout');
    return NextResponse.redirect(url);
  }

  // Handle admin-only login
  const siteConfig = (siteConfigResult as { data: { login_admin_only: boolean } | null })?.data;
  if (siteConfig?.login_admin_only) {
    let role: string | null = null;
    if (discordResult) {
      role = ((discordResult as [{ data: { role?: string } | null }, unknown])[0]?.data as { role?: string } | null)?.role || null;
    } else {
      const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
      role = p?.role || null;
    }
    if (role !== 'admin') {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('message', 'admin_only');
      return NextResponse.redirect(url);
    }
  }

  // Handle Discord checks
  if (discordRequired && discordResult) {
    const [profileResult, discordLinkResult] = discordResult as [
      { data: { role?: string; blocked_until?: string; block_reason?: string } | null },
      { data: { discord_user_id?: string; status?: string; sanction_ends_at?: string | null; is_permanent?: boolean; guild_member?: boolean; has_required_role?: boolean } | null }
    ];

    const profileData = profileResult?.data;
    const rawLink = discordLinkResult?.data;
    const discordLink = rawLink
      ? { status: (rawLink.status || 'pending') as DiscordLinkStatus, sanction_ends_at: rawLink.sanction_ends_at ?? null, is_permanent: rawLink.is_permanent ?? false, discord_user_id: rawLink.discord_user_id, guild_member: rawLink.guild_member, has_required_role: rawLink.has_required_role }
      : null;

    if (discordLink?.is_permanent || discordLink?.status === 'permanent_block') {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('message', 'discord_removed');
      return NextResponse.redirect(url);
    }

    const isTempBlocked =
      isTemporaryDiscordSanctionActive(discordLink) ||
      Boolean(profileData?.blocked_until && new Date(profileData.blocked_until) > new Date());
    const needsDiscordLink = !discordLink?.discord_user_id;
    const invalidDiscordMembership =
      discordLink?.status === 'missing_guild' || discordLink?.status === 'missing_role';

    if ((needsDiscordLink || invalidDiscordMembership || isTempBlocked) && !isDiscordRequiredPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/discord-obligatoire';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|downloads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|exe)$).*)'],
};
