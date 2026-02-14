import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isDownload = pathname === '/download';
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic = pathname === '/api/setup' || pathname === '/api/has-admin';

  // CORS preflight : laisser passer sans vérification (requis pour l'app Electron VHF)
  if (request.method === 'OPTIONS') {
    return NextResponse.next({ request });
  }

  // Requêtes API avec Bearer token (app Electron) : laisser la route gérer l'auth elle-même
  const authHeader = request.headers.get('authorization');
  if (pathname.startsWith('/api/') && authHeader?.startsWith('Bearer ')) {
    return NextResponse.next({ request });
  }

  // Routes publiques : aucune requête Supabase, réponse immédiate (évite blocage mobile)
  if (isAuthCallback || isApiPublic || isSetup || isLogin || isDownload) {
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

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
