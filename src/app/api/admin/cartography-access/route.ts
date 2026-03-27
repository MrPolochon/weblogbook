import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashCartographyPassword } from '@/lib/cartography-access';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_config')
    .select('cartography_editor_enabled, cartography_editor_password_hash, cartography_editor_updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    enabled: Boolean(data?.cartography_editor_enabled),
    configured: Boolean(data?.cartography_editor_password_hash),
    updated_at: data?.cartography_editor_updated_at ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({})) as {
    enabled?: boolean;
    password?: string;
    clearPassword?: boolean;
  };

  const updates: {
    id: number;
    cartography_editor_enabled?: boolean;
    cartography_editor_password_hash?: string | null;
    cartography_editor_updated_at: string;
  } = {
    id: 1,
    cartography_editor_updated_at: new Date().toISOString(),
  };

  if (typeof body.enabled === 'boolean') {
    updates.cartography_editor_enabled = body.enabled;
  }

  if (body.clearPassword) {
    updates.cartography_editor_password_hash = null;
  }

  if (typeof body.password === 'string' && body.password.trim()) {
    updates.cartography_editor_password_hash = hashCartographyPassword(body.password.trim());
    updates.cartography_editor_enabled = true;
  }

  if (
    updates.cartography_editor_enabled === undefined &&
    updates.cartography_editor_password_hash === undefined
  ) {
    return NextResponse.json({ error: 'Aucune modification fournie' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_config')
    .upsert(updates, { onConflict: 'id' })
    .select('cartography_editor_enabled, cartography_editor_password_hash, cartography_editor_updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    enabled: Boolean(data?.cartography_editor_enabled),
    configured: Boolean(data?.cartography_editor_password_hash),
    updated_at: data?.cartography_editor_updated_at ?? null,
  });
}
