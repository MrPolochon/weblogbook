import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    .from('cartography_editor_drafts')
    .select('id, owner_id, owner_identifiant, title, last_autosaved_at, updated_at, created_at')
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}
