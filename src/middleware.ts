import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isDownload = pathname === '/download';
  const isAeroSchool = pathname.startsWith('/aeroschool');
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic = pathname === '/api/setup' || pathname === '/api/has-admin' || pathname === '/api/site-config';
  const isApiAeroSchoolPublic = pathname.startsWith('/api/aeroschool/') && request.method !== 'PUT' && request.method !== 'DELETE';
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
  if (isAuthCallback || isApiPublic || isApiAeroSchoolPublic || isApiAuth || isSetup || isLogin || isDownload || isAeroSchool) {
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
          cookiesToSet.forEach(({ name, value }) =>
            response.cookies.set(name, value, { path: '/' })
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

  // Connexions réservées aux admins (option activable dans Admin > Sécurité)
  try {
    const { data: siteConfig } = await supabase.from('site_config').select('login_admin_only').eq('id', 1).single();
    if (siteConfig?.login_admin_only) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
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

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
