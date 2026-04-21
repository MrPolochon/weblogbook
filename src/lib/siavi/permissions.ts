import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

const CHEF_DE_BRIGADE_NOM = 'Chef de brigade SIAVI';

export async function isChefDeBrigade(
  admin: AdminClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, siavi_grade_id')
    .eq('id', userId)
    .single();

  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (!profile.siavi_grade_id) return false;

  const { data: grade } = await admin
    .from('siavi_grades')
    .select('nom')
    .eq('id', profile.siavi_grade_id)
    .single();

  return grade?.nom === CHEF_DE_BRIGADE_NOM;
}

export async function canAccessSiavi(
  admin: AdminClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, siavi')
    .eq('id', userId)
    .single();

  if (!profile) return false;
  return profile.role === 'admin' || profile.role === 'siavi' || Boolean(profile.siavi);
}

export async function getSiaviCompte(admin: AdminClient) {
  const { data } = await admin
    .from('felitz_comptes')
    .select('id, solde, vban')
    .eq('type', 'siavi')
    .single();
  return data;
}
