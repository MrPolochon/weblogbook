import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDiscordLinkRequired, isTemporaryDiscordSanctionActive, type DiscordLinkStatus } from '@/lib/discord-link';

// ─────────────────────────────────────────────────────────────────────────────
// Cache module-level du statut de maintenance (TTL : 30 s)
// En Edge Runtime les variables module-level persistent dans le même V8 isolate.
// ─────────────────────────────────────────────────────────────────────────────
type MaintenanceStatus = {
  active: boolean;
  message: string;
  maintenance_until: string | null;
};

let _maintenanceCache: { data: MaintenanceStatus; fetchedAt: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 30_000;

async function getMaintenanceStatus(
  admin: ReturnType<typeof createAdminClient>,
): Promise<MaintenanceStatus | null> {
  const now = Date.now();
  if (_maintenanceCache && now - _maintenanceCache.fetchedAt < MAINTENANCE_CACHE_TTL_MS) {
    return _maintenanceCache.data;
  }
  try {
    const { data, error } = await admin
      .from('app_maintenance')
      .select('active, message, maintenance_until')
      .eq('id', 1)
      .single();
    if (error || !data) return null;
    const status: MaintenanceStatus = {
      active: Boolean(data.active),
      message: (data.message as string | null) ?? 'Maintenance en cours.',
      maintenance_until: (data.maintenance_until as string | null) ?? null,
    };
    _maintenanceCache = { data: status, fetchedAt: now };
    return status;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isDownload = pathname === '/download';
  const isAeroSchool = pathname.startsWith('/aeroschool');
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic =
    pathname === '/api/setup' ||
    pathname === '/api/has-admin' ||
    pathname === '/api/site-config' ||
    pathname === '/api/login-logo' ||
    pathname === '/api/maintenance-status';
  const isApiDiscord = pathname.startsWith('/api/discord/');
  const isApiAeroSchoolPublic = pathname.startsWith('/api/aeroschool/') && request.method !== 'PUT' && request.method !== 'DELETE';
  const isDiscordRequiredPage = pathname === '/discord-obligatoire';
  const isApiAuth = pathname.startsWith('/api/auth/');
  const isMaintenance = pathname === '/maintenance';

  if (request.method === 'OPTIONS') {
    return NextResponse.next({ request });
  }

  const authHeader = request.headers.get('authorization');
  // Whitelist stricte des routes API qui peuvent être appelées avec un Bearer JWT
  // (apps externes type radio VHF, LiveKit token, sondes ATC).
  // Toute autre route avec Bearer doit passer par le flux session classique :
  // sinon n'importe quel header "Authorization: Bearer xxx" bypassait toute la sécurité
  // (security_logout, login_admin_only, blocage Discord, etc.).
  const BEARER_BYPASS_PREFIXES = [
    '/api/livekit/token',
    '/api/livekit/status',
    '/api/vhf/frequencies',
    '/api/atc/online',
  ];
  if (
    pathname.startsWith('/api/') &&
    authHeader?.startsWith('Bearer ') &&
    BEARER_BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next({ request });
  }

  const isCarteAtc = pathname === '/carte-atc';
  const isApiAtcOnline = pathname === '/api/atc/online';

  if (
    isAuthCallback || isApiPublic || isApiDiscord || isApiAeroSchoolPublic || isApiAuth ||
    isSetup || isLogin || isDownload || isAeroSchool || isCarteAtc || isApiAtcOnline ||
    isMaintenance
  ) {
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

  const [securityResult, siteConfigResult, discordResult, maintenanceStatus] = await Promise.all([
    // 1) Security logout check (fail-closed : en cas d'erreur DB on déconnecte par sécurité)
    Promise.resolve(admin.from('security_logout').select('user_id').eq('user_id', user.id).maybeSingle())
      .catch(() => ({ error: true, data: null })),

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

    // 4) Statut de maintenance (utilise le cache 30 s — quasi-gratuit si en cache)
    getMaintenanceStatus(admin),
  ]);

  // Handle security logout (fail-closed : si erreur de lecture, on déconnecte par sécurité)
  const securityErr = (securityResult as { error?: boolean })?.error === true;
  const logoutRow = (securityResult as { data: { user_id: string } | null })?.data;
  if (securityErr || logoutRow) {
    if (logoutRow) {
      try { await admin.from('security_logout').delete().eq('user_id', user.id); } catch { /* ignore */ }
    }
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('message', securityErr ? 'inactivity' : 'security_logout');
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

  // ── Défense en profondeur : vérification de rôle pour les pages protégées ──
  // Les routes /ground, /atc, /siavi, /admin ne sont PAS dans la liste des routes publiques
  // et sont donc couvertes par le check d'auth ci-dessus (redirect /login si non connecté).
  // La vérification du rôle spécifique est assurée par les layouts Server Component de chaque
  // groupe de routes (plus flexibles car ils accèdent aux flags booléens atc/siavi/etc.).
  // Ici, on ajoute uniquement un guard admin simple pour /admin/* si le profil est déjà dispo.
  if (discordResult && !pathname.startsWith('/api/')) {
    const roleFromDiscord = ((discordResult as [{ data: { role?: string } | null }, unknown])[0]?.data as { role?: string } | null)?.role ?? null;
    const isAdminPageRoute = pathname.startsWith('/admin');
    if (isAdminPageRoute && roleFromDiscord !== null && roleFromDiscord !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  // ── Mode maintenance ─────────────────────────────────────────────────────
  // Bloque tous les utilisateurs non-admin si la maintenance est active.
  // Les admins passent toujours, même en maintenance.
  if (maintenanceStatus?.active && !pathname.startsWith('/api/')) {
    const until = maintenanceStatus.maintenance_until;

    if (until && new Date(until).getTime() < Date.now()) {
      // La maintenance_until est dépassé → désactivation automatique en arrière-plan
      admin
        .from('app_maintenance')
        .update({ active: false })
        .eq('id', 1)
        .then(() => { _maintenanceCache = null; }, () => {});
      // On laisse passer la requête
    } else {
      // Maintenance toujours active → vérifier si l'utilisateur est admin
      let userRole: string | null = null;
      if (discordResult) {
        userRole =
          ((discordResult as [{ data: { role?: string } | null }, unknown])[0]?.data as { role?: string } | null)?.role ?? null;
      } else {
        try {
          const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
          userRole = p?.role ?? null;
        } catch { /* ignore */ }
      }

      if (userRole !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/maintenance';
        return NextResponse.redirect(url);
      }
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
