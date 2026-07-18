import { createAdminClient } from '@/lib/supabase/admin';

export type ArmeeBriefing = {
  titre: string;
  contenu: string;
  actif: boolean;
  updated_at: string | null;
};

const DEFAULT: ArmeeBriefing = {
  titre: 'Briefing opérationnel',
  contenu: '',
  actif: false,
  updated_at: null,
};

export async function getActiveBriefing(): Promise<ArmeeBriefing | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('armee_briefing')
    .select('titre, contenu, actif, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (!data || !data.actif || !String(data.contenu || '').trim()) return null;
  return {
    titre: data.titre || DEFAULT.titre,
    contenu: String(data.contenu),
    actif: true,
    updated_at: data.updated_at,
  };
}

export async function getBriefingForAdmin(): Promise<ArmeeBriefing> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('armee_briefing')
    .select('titre, contenu, actif, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (!data) return DEFAULT;
  return {
    titre: data.titre || DEFAULT.titre,
    contenu: String(data.contenu || ''),
    actif: Boolean(data.actif),
    updated_at: data.updated_at,
  };
}

export async function updateBriefing(
  input: { titre: string; contenu: string; actif: boolean },
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('armee_briefing')
    .upsert({
      id: 1,
      titre: input.titre.trim() || DEFAULT.titre,
      contenu: input.contenu.trim(),
      actif: input.actif,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
