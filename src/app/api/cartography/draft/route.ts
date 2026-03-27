import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCartographyExport,
  createDefaultCartographyDraft,
  type CartographyDraftData,
} from '@/lib/cartography-data';
import {
  CARTOGRAPHY_ACCESS_COOKIE,
  hasCartographyEditorAccess,
} from '@/lib/cartography-access';

export const dynamic = 'force-dynamic';

async function requireEditorAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CARTOGRAPHY_ACCESS_COOKIE)?.value;

  const admin = createAdminClient();
  const { data: config, error } = await admin
    .from('site_config')
    .select('cartography_editor_enabled, cartography_editor_password_hash')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!hasCartographyEditorAccess(cookieValue, config?.cartography_editor_enabled, config?.cartography_editor_password_hash)) {
    return { error: NextResponse.json({ error: 'Accès cartographie non autorisé' }, { status: 403 }) };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('identifiant')
    .eq('id', user.id)
    .maybeSingle();

  return { user, admin, identifiant: profile?.identifiant ?? null };
}

function normalizeDraftPayload(input: unknown): CartographyDraftData {
  if (!input || typeof input !== 'object') {
    return createDefaultCartographyDraft();
  }

  const base = createDefaultCartographyDraft();
  const data = input as Partial<CartographyDraftData>;
  return {
    positions: typeof data.positions === 'object' && data.positions ? data.positions as CartographyDraftData['positions'] : base.positions,
    islands: Array.isArray(data.islands) ? data.islands : base.islands,
    firZones: Array.isArray(data.firZones) ? data.firZones : base.firZones,
    waypoints: Array.isArray(data.waypoints) ? data.waypoints : base.waypoints,
    vors: Array.isArray(data.vors) ? data.vors : base.vors,
  };
}

export async function GET() {
  const guard = await requireEditorAccess();
  if ('error' in guard) return guard.error;

  const { admin, user } = guard;
  const { data, error } = await admin
    .from('cartography_editor_drafts')
    .select('id, title, payload, last_autosaved_at, updated_at')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = normalizeDraftPayload(data?.payload);
  return NextResponse.json({
    draft: {
      id: data?.id ?? null,
      title: data?.title ?? 'Brouillon cartographie',
      payload,
      last_autosaved_at: data?.last_autosaved_at ?? null,
      updated_at: data?.updated_at ?? null,
      exports: buildCartographyExport(payload),
    },
  });
}

export async function PUT(request: NextRequest) {
  const guard = await requireEditorAccess();
  if ('error' in guard) return guard.error;

  const { admin, user, identifiant } = guard;
  const body = await request.json().catch(() => ({})) as {
    title?: string;
    payload?: unknown;
  };

  const payload = normalizeDraftPayload(body.payload);
  const title = body.title?.trim() || 'Brouillon cartographie';

  const { data, error } = await admin
    .from('cartography_editor_drafts')
    .upsert({
      owner_id: user.id,
      owner_identifiant: identifiant,
      title,
      payload,
      last_autosaved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' })
    .select('id, title, last_autosaved_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draft: {
      id: data.id,
      title: data.title,
      last_autosaved_at: data.last_autosaved_at,
      updated_at: data.updated_at,
      exports: buildCartographyExport(payload),
    },
  });
}
