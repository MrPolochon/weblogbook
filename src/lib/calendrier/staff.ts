import { createAdminClient } from '@/lib/supabase/admin';

export type SiteAdminProfile = {
  id: string;
  identifiant: string;
  role: string;
};

/** Un événement calendrier ne peut être créé que par un compte site `role = admin`. */
export async function findSiteAdminByDiscordId(discordId: string): Promise<SiteAdminProfile | null> {
  const id = String(discordId || '').trim();
  if (!id) return null;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from('discord_links')
    .select('user_id')
    .eq('discord_user_id', id)
    .maybeSingle();
  if (!link?.user_id) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('id, identifiant, role')
    .eq('id', link.user_id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') return null;
  return { id: profile.id, identifiant: profile.identifiant, role: profile.role };
}

export async function requireSiteAdmin(userId: string): Promise<SiteAdminProfile | null> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, identifiant, role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') return null;
  return { id: profile.id, identifiant: profile.identifiant, role: profile.role };
}
