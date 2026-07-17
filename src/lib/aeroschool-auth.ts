import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AeroSchoolRespondentProfile {
  userId: string;
  identifiant: string;
  discordUsername: string | null;
}

/** Utilisateur connecté (optionnel — formulaires publics). */
export async function getAeroSchoolRespondent(): Promise<AeroSchoolRespondentProfile | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const [{ data: profile }, { data: discord }] = await Promise.all([
      admin.from('profiles').select('identifiant').eq('id', user.id).maybeSingle(),
      admin.from('discord_links').select('discord_username').eq('user_id', user.id).maybeSingle(),
    ]);

    return {
      userId: user.id,
      identifiant: (profile?.identifiant as string) || user.id.slice(0, 8),
      discordUsername: (discord?.discord_username as string) || null,
    };
  } catch {
    return null;
  }
}

/** Exige une session valide pour les formulaires `requires_auth`. */
export async function requireAeroSchoolRespondent(): Promise<
  { ok: true; profile: AeroSchoolRespondentProfile } | { ok: false; status: 401 }
> {
  const profile = await getAeroSchoolRespondent();
  if (!profile) return { ok: false, status: 401 };
  return { ok: true, profile };
}
