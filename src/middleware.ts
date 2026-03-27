import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDiscordLinkRequired, isTemporaryDiscordSanctionActive } from '@/lib/discord-link';

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
  // Routes auth (login, code, etc.) : ne pas rediriger ici, laisser la route vérifier la session (évite 307 après signIn)
  const isApiAuth = pathname.startsWith('/api/auth/');

  // CORS preflight : laisser passer sans vérification (requis pour l'app Electron/Android VHF)
  if (request.method === 'OPTIONS') {
    return NextResponse.next({ request });
  }

  // Requêtes API avec Bearer token (app Electron/Android) : laisser la route gérer l'auth elle-même
  const authHeader = request.headers.get('authorization');
  if (pathname.startsWith('/api/') && authHeader?.startsWith('Bearer ')) {
    return NextResponse.next({ request });
  }

  // Routes publiques (et API auth : vérification session faite dans la route)
  const isCarteAtc = pathname === '/carte-atc';
  const isApiAtcOnline = pathname === '/api/atc/online';

  if (isAuthCallback || isApiPublic || isApiDiscord || isApiAeroSchoolPublic || isApiAuth || isSetup || isLogin || isDownload || isAeroSchool || isCarteAtc || isApiAtcOnline) {
    return NextResponse.next({ request });
  }

  // Routes protégées : vérifier la session
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

  // Déconnexion forcée (ex: code approbation IP incorrect)
  try {
    const admin = createAdminClient();
    const { data: logoutRow } = await admin.from('security_logout').select('user_id').eq('user_id', user.id).maybeSingle();
    if (logoutRow) {
      await admin.from('security_logout').delete().eq('user_id', user.id);
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('message', 'security_logout');
      return NextResponse.redirect(url);
    }
  } catch {
    // Table security_logout peut ne pas exister
  }

  // Connexions réservées aux admins (option activable dans Admin > Sécurité)
  // Lecture avec admin client pour être sûr d'avoir la valeur (évite RLS/cache)
  try {
    const admin = createAdminClient();
    const { data: siteConfig } = await admin.from('site_config').select('login_admin_only').eq('id', 1).maybeSingle();
    if (siteConfig?.login_admin_only) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('message', 'admin_only');
        return NextResponse.redirect(url);
      }
    }
  } catch {
    // Table site_config peut ne pas exister (migration non exécutée)
  }

  // Vérification par email à chaque connexion : si le cookie est présent, rediriger vers la page de saisie du code
  const pendingVerification = request.cookies.get('pending_login_verification')?.value;
  if (pendingVerification && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('step', 'verify');
    return NextResponse.redirect(url);
  }

  if (isDiscordLinkRequired()) {
    try {
      const admin = createAdminClient();
      const [{ data: profile }, { data: discordLink }] = await Promise.all([
        admin.from('profiles').select('blocked_until, block_reason').eq('id', user.id).maybeSingle(),
        admin
          .from('discord_links')
          .select('discord_user_id, status, sanction_ends_at, is_permanent, guild_member, has_required_role')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (discordLink?.is_permanent || discordLink?.status === 'permanent_block') {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('message', 'discord_removed');
        return NextResponse.redirect(url);
      }

      const isTempBlocked =
        isTemporaryDiscordSanctionActive(discordLink) ||
        Boolean(profile?.blocked_until && new Date(profile.blocked_until) > new Date());
      const needsDiscordLink = !discordLink?.discord_user_id;
      const invalidDiscordMembership =
        discordLink?.status === 'missing_guild' || discordLink?.status === 'missing_role';

      if ((needsDiscordLink || invalidDiscordMembership || isTempBlocked) && !isDiscordRequiredPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/discord-obligatoire';
        return NextResponse.redirect(url);
      }
    } catch {
      // Si la table Discord n'existe pas encore ou que l'env n'est pas prêt, ne pas casser tout le site.
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
