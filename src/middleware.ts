import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isStaleRefreshToken } from '@/lib/auth/session-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDiscordLinkRequired, isTemporaryDiscordSanctionActive, type DiscordLinkStatus } from '@/lib/discord-link';
import { SIAVI_SPACE_MAINTENANCE } from '@/lib/siavi/space-status';
import { RADAR_ENABLED } from '@/lib/radar-status';

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

// getUser() contacte Auth à chaque requête et, depuis l'Edge, peut rester
// bloqué jusqu'au 504 Vercel. Ici la session est lue dans le cookie. Les
// contrôles base (déconnexion, Discord, maintenance) ont un délai court :
// s'ils n'aboutissent pas, la page continue et les layouts revérifient l'utilisateur.
const MIDDLEWARE_FETCH_MS = 3_500;
const MIDDLEWARE_DEADLINE_MS = 8_000;
const GUARD_CACHE_TTL_MS = 20_000;
const GUARD_CACHE_MAX = 400;

function passThrough(request: NextRequest) {
  return NextResponse.next({ request });
}

function middlewareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  if (init?.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      const err = new Error('middleware_fetch_timeout');
      err.name = 'TimeoutError';
      reject(err);
    }, MIDDLEWARE_FETCH_MS);
    fetch(input, { ...init, cache: 'no-store', signal: controller.signal }).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message.includes('middleware_fetch_timeout') ||
    message.includes('abort') ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return true;
  }
  return 'cause' in error && isTimeoutError((error as { cause?: unknown }).cause);
}

function isResultTimeout(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  if ('timeout' in result && (result as { timeout?: boolean }).timeout) return true;
  return isTimeoutError((result as { error?: unknown }).error);
}

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

type GuardBundle = {
  fetchedAt: number;
  securityResult: unknown;
  siteConfigResult: unknown;
  discordResult: unknown;
  maintenanceStatus: MaintenanceStatus | { timeout: true } | null;
};

const _guardCache = new Map<string, GuardBundle>();

function readGuardCache(userId: string): GuardBundle | null {
  const hit = _guardCache.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > GUARD_CACHE_TTL_MS) {
    _guardCache.delete(userId);
    return null;
  }
  return hit;
}

function writeGuardCache(userId: string, bundle: GuardBundle) {
  if (_guardCache.size >= GUARD_CACHE_MAX) {
    const oldest = _guardCache.keys().next().value;
    if (oldest) _guardCache.delete(oldest);
  }
  _guardCache.set(userId, bundle);
}

/** `sub` du JWT d'accès, sans passer par session.user (proxy qui avertit à chaque lecture). */
function userIdFromAccessToken(accessToken: string): string | null {
  const part = accessToken.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

async function getMaintenanceStatus(
  admin: ReturnType<typeof createAdminClient>,
): Promise<MaintenanceStatus | { timeout: true } | null> {
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
    if (isTimeoutError(error)) return { timeout: true };
    if (error || !data) return null;
    const status: MaintenanceStatus = {
      active: Boolean(data.active),
      message: (data.message as string | null) ?? 'Maintenance en cours.',
      maintenance_until: (data.maintenance_until as string | null) ?? null,
    };
    _maintenanceCache = { data: status, fetchedAt: now };
    return status;
  } catch (err) {
    if (isTimeoutError(err)) return { timeout: true };
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  if (!RADAR_ENABLED && (
    request.nextUrl.pathname.startsWith('/api/radar/') ||
    request.nextUrl.pathname.startsWith('/api/pftester-odw/') ||
    request.nextUrl.pathname === '/api/carte-atc/flights' ||
    request.nextUrl.pathname === '/api/cron/pf-odw-tracks'
  )) {
    return NextResponse.json({ error: 'Radar temporairement désactivé', disabled: true }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<NextResponse>((resolve) => {
    timer = setTimeout(() => resolve(passThrough(request)), MIDDLEWARE_DEADLINE_MS);
  });
  const pending = runMiddleware(request);
  void pending.catch(() => {});
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isDownload = pathname === '/download';
  const isCodeConduite = pathname === '/code-de-conduite' || pathname.startsWith('/docs/');
  const isLivretProgression = pathname === '/livret-progression';
  const isManuelControleur = pathname === '/manuel-controleur';
  const isTranscript = pathname.startsWith('/support/transcript/');
  const isAeroSchool = pathname.startsWith('/aeroschool');
  const isCalendrier = pathname === '/calendrier' || pathname === '/api/calendrier';
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic =
    pathname === '/api/setup' ||
    pathname === '/api/has-admin' ||
    pathname === '/api/site-config' ||
    pathname === '/api/login-logo' ||
    pathname === '/api/maintenance-status' ||
    pathname === '/api/pftester-odw/access' ||
    // Tracker PFtesterODW public (/carte-atc) : sans exemption, le middleware
    // redirigerait vers /login et le client recevrait du HTML au lieu du JSON.
    pathname === '/api/pftester-odw/live' ||
    pathname === '/api/pftester-odw/flights' ||
    pathname === '/api/pftester-odw/tracks' ||
    pathname === '/api/pftester-odw/now' ||
    pathname.startsWith('/api/pftester-odw/tiles/') ||
    pathname === '/api/carte-atc/flights' ||
    pathname.startsWith('/api/cron/');
  const isApiDiscord = pathname.startsWith('/api/discord/');
  const isApiSupportBot = pathname.startsWith('/api/support/bot');
  const isApiDiscordInteractions = pathname.startsWith('/api/support/discord/interactions');
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
    isAuthCallback || isApiPublic || isApiDiscord || isApiSupportBot || isApiDiscordInteractions || isApiAeroSchoolPublic || isApiAuth ||
    isSetup || isLogin || isDownload || isCodeConduite || isLivretProgression || isManuelControleur || isAeroSchool || isCalendrier || isCarteAtc || isApiAtcOnline ||
    isMaintenance || isTranscript
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: middlewareFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          // Propager le nouveau refresh token à la requête en cours (RSC / API)
          // sinon getUser() rejoue l’ancien token → refresh_token_not_found.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { path: '/', ...options })
          );
        },
      },
    }
  );
  let userId: string | null = null;
  let authError: { code?: string; message?: string } | null = null;
  try {
    // Lecture locale du cookie. Réseau seulement si le jeton est à moins de 90 s de l'expiration.
    const authResult = await supabase.auth.getSession();
    authError = authResult.error;
    const accessToken = authResult.data.session?.access_token;
    if (accessToken) userId = userIdFromAccessToken(accessToken);
  } catch (err) {
    if (isTimeoutError(err)) return response;
    throw err;
  }
  if (!userId) {
    if (isTimeoutError(authError)) return response;
    if (isStaleRefreshToken(authError)) {
      await supabase.auth.signOut();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return copyCookies(response, NextResponse.redirect(url));
  }

  const pendingVerification = request.cookies.get('pending_login_verification')?.value;
  if (pendingVerification && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('step', 'verify');
    return copyCookies(response, NextResponse.redirect(url));
  }

  // Contrôles base en parallèle, mis en cache 20 s par utilisateur pour ne pas
  // retaper Supabase à chaque navigation.
  const admin = createAdminClient({ fetch: middlewareFetch });
  const discordRequired = isDiscordLinkRequired();
  const cachedGuards = readGuardCache(userId);

  const [securityResult, siteConfigResult, discordResult, maintenanceStatus] = cachedGuards
    ? [cachedGuards.securityResult, cachedGuards.siteConfigResult, cachedGuards.discordResult, cachedGuards.maintenanceStatus]
    : await Promise.all([
    // 1) Security logout check (fail-closed : en cas d'erreur DB on déconnecte par sécurité)
    Promise.resolve(admin.from('security_logout').select('user_id').eq('user_id', userId).maybeSingle())
      .catch((err) => (isTimeoutError(err) ? { timeout: true as const, data: null } : { error: true, data: null })),

    // 2) Site config (admin-only login)
    Promise.resolve(admin.from('site_config').select('login_admin_only').eq('id', 1).maybeSingle())
      .catch((err) => (isTimeoutError(err) ? { timeout: true as const, data: null } : { data: null })),

    // 3) Discord + profile blocked (only if discord required)
    discordRequired
      ? Promise.all([
          admin.from('profiles').select('role, blocked_until, block_reason').eq('id', userId).maybeSingle(),
          admin.from('discord_links')
            .select('discord_user_id, status, sanction_ends_at, is_permanent, guild_member, has_required_role')
            .eq('user_id', userId)
            .maybeSingle(),
        ]).catch((err) => (isTimeoutError(err) ? { timeout: true as const } : [{ data: null }, { data: null }] as const))
      : Promise.resolve(null),

    // 4) Statut de maintenance (utilise le cache 30 s — quasi-gratuit si en cache)
    getMaintenanceStatus(admin),
  ]);

  const guardsTimedOut =
    isResultTimeout(securityResult) ||
    isResultTimeout(siteConfigResult) ||
    isResultTimeout(discordResult) ||
    isResultTimeout(maintenanceStatus) ||
    (Array.isArray(discordResult) && discordResult.some((item) => isResultTimeout(item)));

  if (!cachedGuards && !guardsTimedOut) {
    writeGuardCache(userId, {
      fetchedAt: Date.now(),
      securityResult,
      siteConfigResult,
      discordResult,
      maintenanceStatus,
    });
  }

  if (guardsTimedOut) return response;

  // Handle security logout (fail-closed : si erreur de lecture, on déconnecte par sécurité)
  const securityErr = (securityResult as { error?: boolean })?.error === true;
  const logoutRow = (securityResult as { data: { user_id: string } | null })?.data;
  if (securityErr || logoutRow) {
    _guardCache.delete(userId);
    if (logoutRow) {
      try { await admin.from('security_logout').delete().eq('user_id', userId); } catch { /* ignore */ }
    }
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('message', securityErr ? 'inactivity' : 'security_logout');
    return copyCookies(response, NextResponse.redirect(url));
  }

  // Handle admin-only login
  const siteConfig = (siteConfigResult as { data: { login_admin_only: boolean } | null })?.data;
  if (siteConfig?.login_admin_only) {
    let role: string | null = null;
    if (discordResult) {
      role = ((discordResult as [{ data: { role?: string } | null }, unknown])[0]?.data as { role?: string } | null)?.role || null;
    } else {
      const { data: p } = await admin.from('profiles').select('role').eq('id', userId).single();
      role = p?.role || null;
    }
    if (role !== 'admin') {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('message', 'admin_only');
      return copyCookies(response, NextResponse.redirect(url));
    }
  }

  if (SIAVI_SPACE_MAINTENANCE && pathname.startsWith('/api/siavi')) {
    let siaviRole: string | null = null;
    if (discordResult) {
      siaviRole =
        ((discordResult as [{ data: { role?: string } | null }, unknown])[0]?.data as { role?: string } | null)?.role ?? null;
    } else {
      try {
        const { data: p } = await admin.from('profiles').select('role').eq('id', userId).single();
        siaviRole = p?.role ?? null;
      } catch { /* ignore */ }
    }
    if (siaviRole !== 'admin') {
      return NextResponse.json(
        { error: 'Espace SIAVI en cours de maintenance.' },
        { status: 503 },
      );
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
      return copyCookies(response, NextResponse.redirect(url));
    }
  }

  // ── Mode maintenance ─────────────────────────────────────────────────────
  // Bloque tous les utilisateurs non-admin si la maintenance est active.
  // Les admins passent toujours, même en maintenance.
  if (maintenanceStatus && 'active' in maintenanceStatus && maintenanceStatus.active && !pathname.startsWith('/api/')) {
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
          const { data: p } = await admin.from('profiles').select('role').eq('id', userId).single();
          userRole = p?.role ?? null;
        } catch { /* ignore */ }
      }

      if (userRole !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/maintenance';
        return copyCookies(response, NextResponse.redirect(url));
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
      _guardCache.delete(userId);
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('message', 'discord_removed');
      return copyCookies(response, NextResponse.redirect(url));
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
      return copyCookies(response, NextResponse.redirect(url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|downloads/|docs/|api/support/discord/interactions|api/support/bot|.*\\.(?:svg|png|jpg|jpeg|gif|webp|exe|pdf)$).*)',
  ],
};
