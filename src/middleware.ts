import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            response.cookies.set(name, value, { path: '/' })
          );
        },
      },
    }
  );
  await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isSetup = pathname === '/setup';
  const isLogin = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiPublic = pathname === '/api/setup' || pathname === '/api/has-admin';

  if (isAuthCallback || isApiPublic) return response;
  if (isSetup || isLogin) return response;

  // Toutes les autres routes : besoin d'être connecté (sauf assets, _next, etc.)
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
