import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import CartographyTempAdminClient from './CartographyTempAdminClient';

export const dynamic = 'force-dynamic';

export default async function CartographieTempAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/logbook');

  const [{ data: config }, { data: drafts }] = await Promise.all([
    admin
      .from('site_config')
      .select('cartography_editor_enabled, cartography_editor_password_hash, cartography_editor_updated_at')
      .eq('id', 1)
      .maybeSingle(),
    admin
      .from('cartography_editor_drafts')
      .select('id, owner_id, owner_identifiant, title, last_autosaved_at, updated_at, created_at')
      .order('updated_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">Cartographie temporaire</h1>
      <CartographyTempAdminClient
        initialEnabled={Boolean(config?.cartography_editor_enabled)}
        initialConfigured={Boolean(config?.cartography_editor_password_hash)}
        initialUpdatedAt={config?.cartography_editor_updated_at ?? null}
        initialDrafts={drafts ?? []}
        editorUrl="/cartographie-temporaire"
      />
    </div>
  );
}
