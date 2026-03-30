import type { SupabaseClient } from '@supabase/supabase-js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSuffix(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CHARS[Math.floor(Math.random() * 36)];
  }
  return s;
}

async function genererVbanPersonnelUnique(admin: SupabaseClient): Promise<string | null> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const vban = `MIXOU${randomSuffix(22)}`;
    const { data: ex } = await admin.from('felitz_comptes').select('id').eq('vban', vban).maybeSingle();
    if (!ex) return vban;
  }
  return null;
}

async function genererVbanEntrepriseUnique(admin: SupabaseClient): Promise<string | null> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const vban = `ENTERMIXOU${randomSuffix(22)}`;
    const { data: ex } = await admin.from('felitz_comptes').select('id').eq('vban', vban).maybeSingle();
    const { data: exComp } = await admin.from('compagnies').select('id').eq('vban', vban).maybeSingle();
    if (!ex && !exComp) return vban;
  }
  return null;
}

/** Compte personnel le plus ancien — référence stable si doublons historiques. */
export async function getComptePersonnelCanonique(
  admin: SupabaseClient,
  proprietaireId: string
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', proprietaireId)
    .eq('type', 'personnel')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getComptePersonnelCanonique', error.message);
    return null;
  }
  return data?.id ? { id: data.id } : null;
}

/** Compte entreprise le plus ancien par compagnie. */
export async function getCompteEntrepriseCanonique(
  admin: SupabaseClient,
  compagnieId: string
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('compagnie_id', compagnieId)
    .eq('type', 'entreprise')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getCompteEntrepriseCanonique', error.message);
    return null;
  }
  return data?.id ? { id: data.id } : null;
}

/**
 * Garantit un compte Felitz personnel pour le pilote (création si absent).
 * Les profils créés avant le trigger SQL ou restaurés sans compte en bénéficient.
 */
export async function ensureComptePersonnel(
  admin: SupabaseClient,
  proprietaireId: string
): Promise<{ id: string } | null> {
  const existing = await getComptePersonnelCanonique(admin, proprietaireId);
  if (existing) return existing;

  const { data: profile } = await admin.from('profiles').select('id').eq('id', proprietaireId).maybeSingle();
  if (!profile) return null;

  const vban = await genererVbanPersonnelUnique(admin);
  if (!vban) {
    console.error('ensureComptePersonnel: échec génération VBAN');
    return null;
  }

  const { data: inserted, error } = await admin
    .from('felitz_comptes')
    .insert({
      type: 'personnel',
      proprietaire_id: proprietaireId,
      vban,
      solde: 0,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return getComptePersonnelCanonique(admin, proprietaireId);
    }
    console.error('ensureComptePersonnel insert:', error.message);
    return null;
  }

  return inserted ? { id: inserted.id } : null;
}

/**
 * Garantit le compte Felitz entreprise (même VBAN que compagnies.vban si présent).
 */
export async function ensureCompteEntreprise(
  admin: SupabaseClient,
  compagnieId: string
): Promise<{ id: string } | null> {
  const existing = await getCompteEntrepriseCanonique(admin, compagnieId);
  if (existing) return existing;

  const { data: comp } = await admin
    .from('compagnies')
    .select('id, vban')
    .eq('id', compagnieId)
    .maybeSingle();
  if (!comp) return null;

  let vban = comp.vban?.trim() || null;
  if (!vban) {
    const gen = await genererVbanEntrepriseUnique(admin);
    if (!gen) {
      console.error('ensureCompteEntreprise: échec génération VBAN');
      return null;
    }
    vban = gen;
    await admin.from('compagnies').update({ vban }).eq('id', compagnieId);
  }

  const { data: inserted, error } = await admin
    .from('felitz_comptes')
    .insert({
      type: 'entreprise',
      compagnie_id: compagnieId,
      vban,
      solde: 0,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return getCompteEntrepriseCanonique(admin, compagnieId);
    }
    console.error('ensureCompteEntreprise insert:', error.message);
    return null;
  }

  return inserted ? { id: inserted.id } : null;
}
