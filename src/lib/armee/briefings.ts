import { createAdminClient } from '@/lib/supabase/admin';
import { militaryRpcError } from './validation';

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
  const { data, error } = await admin
    .from('armee_briefing')
    .select('titre, contenu, actif, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error('Impossible de charger le briefing.');
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
  const { data, error } = await admin
    .from('armee_briefing')
    .select('titre, contenu, actif, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error('Impossible de charger le briefing.');
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
  if (input.titre.trim().length > 150 || input.contenu.length > 10000 || (input.actif && !input.contenu.trim())) {
    return { ok: false, error: 'Titre limité à 150 caractères, contenu à 10 000 caractères. Un briefing publié doit contenir des consignes.' };
  }
  const { error } = await admin.rpc('save_armee_briefing', {
    p_actor: updatedBy, p_title: input.titre.trim() || DEFAULT.titre,
    p_content: input.contenu.trim(), p_active: input.actif,
  });

  if (error) return militaryRpcError(error);
  return { ok: true };
}
