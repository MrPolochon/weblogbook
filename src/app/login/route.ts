import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /login : redirection vers GET /login.
 * La page login gère tout en client (formulaire avec preventDefault).
 * Si un POST arrive (ex. formulaire sans JS), on redirige pour éviter 405.
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url, 303);
}
