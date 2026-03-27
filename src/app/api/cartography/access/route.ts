import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CARTOGRAPHY_ACCESS_COOKIE,
  hashCartographyPassword,
  hasCartographyEditorAccess,
} from '@/lib/cartography-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { password } = await request.json().catch(() => ({})) as { password?: string };
  if (!password?.trim()) {
    return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: config, error } = await admin
    .from('site_config')
    .select('cartography_editor_enabled, cartography_editor_password_hash')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hash = hashCartographyPassword(password.trim());
  if (!hasCartographyEditorAccess(hash, config?.cartography_editor_enabled, config?.cartography_editor_password_hash)) {
    return NextResponse.json({ error: 'Mot de passe cartographie incorrect ou accès désactivé' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CARTOGRAPHY_ACCESS_COOKIE, hash, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12,
    path: '/',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CARTOGRAPHY_ACCESS_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
