import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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
import CartographyAccessGate from './CartographyAccessGate';
import CartographyEditorClient from './CartographyEditorClient';

export const dynamic = 'force-dynamic';

export default async function CartographieTemporairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CARTOGRAPHY_ACCESS_COOKIE)?.value;

  const admin = createAdminClient();
  const { data: config } = await admin
    .from('site_config')
    .select('cartography_editor_enabled, cartography_editor_password_hash')
    .eq('id', 1)
    .maybeSingle();

  const accessGranted = hasCartographyEditorAccess(
    cookieValue,
    config?.cartography_editor_enabled,
    config?.cartography_editor_password_hash,
  );

  let initialDraft: {
    title: string;
    payload: CartographyDraftData;
    last_autosaved_at: string | null;
    updated_at: string | null;
    exports: ReturnType<typeof buildCartographyExport>;
  } | null = null;

  if (accessGranted) {
    const { data } = await admin
      .from('cartography_editor_drafts')
      .select('title, payload, last_autosaved_at, updated_at')
      .eq('owner_id', user.id)
      .maybeSingle();

    const payload = (data?.payload as CartographyDraftData | null) ?? createDefaultCartographyDraft();
    initialDraft = {
      title: data?.title ?? 'Brouillon cartographie',
      payload,
      last_autosaved_at: data?.last_autosaved_at ?? null,
      updated_at: data?.updated_at ?? null,
      exports: buildCartographyExport(payload),
    };
  }

  return accessGranted
    ? <CartographyEditorClient initialDraft={initialDraft} />
    : <CartographyAccessGate enabled={Boolean(config?.cartography_editor_enabled)} />;
}
