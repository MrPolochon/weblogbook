import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCartographyExport, createDefaultCartographyDraft } from '@/lib/cartography-data';

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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cartography_editor_drafts')
    .select('id, owner_id, owner_identifiant, title, payload, last_autosaved_at, updated_at, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Brouillon introuvable' }, { status: 404 });
  }

  const payload = (data.payload as ReturnType<typeof createDefaultCartographyDraft> | null) ?? createDefaultCartographyDraft();
  return NextResponse.json({
    draft: {
      ...data,
      payload,
      exports: buildCartographyExport(payload),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { id } = await context.params;
  const admin = createAdminClient();
  const { error } = await admin.from('cartography_editor_drafts').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
