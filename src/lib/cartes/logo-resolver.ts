import type { SupabaseClient } from '@supabase/supabase-js';

export type LogoSource = 'auto' | 'compagnie' | 'manuel' | 'aucun';

export type CompagnieAvecLogo = {
  id: string;
  nom: string;
  logo_url: string | null;
  role_user: 'pdg' | 'co_pdg' | 'employe';
};

type EmployeRow = {
  pilote_id: string;
  role: string | null;
  compagnie_id: string;
  compagnies: { id: string; nom: string; logo_url: string | null } | { id: string; nom: string; logo_url: string | null }[] | null;
};

type PdgRow = { id: string; nom: string; logo_url: string | null };

/**
 * Liste toutes les compagnies auxquelles un utilisateur est rattache
 * (PDG, co-PDG ou employe), avec leur logo et le role de l'user dans chacune.
 * Les compagnies sans logo sont incluses pour permettre le rendu UI complet.
 */
export async function getCompagniesAvecLogoForUser(
  admin: SupabaseClient,
  userId: string
): Promise<CompagnieAvecLogo[]> {
  const out: CompagnieAvecLogo[] = [];
  const seen = new Set<string>();

  // 1) Compagnies dont l'user est PDG
  const { data: pdgRows } = await admin
    .from('compagnies')
    .select('id, nom, logo_url')
    .eq('pdg_id', userId);

  for (const c of (pdgRows || []) as PdgRow[]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push({ id: c.id, nom: c.nom, logo_url: c.logo_url, role_user: 'pdg' });
    }
  }

  // 2) Compagnies via compagnie_employes (employe ou co-PDG)
  const { data: empRows } = await admin
    .from('compagnie_employes')
    .select('pilote_id, role, compagnie_id, compagnies(id, nom, logo_url)')
    .eq('pilote_id', userId);

  for (const e of (empRows || []) as EmployeRow[]) {
    const compRaw = e.compagnies;
    const comp = Array.isArray(compRaw) ? compRaw[0] : compRaw;
    if (!comp || !comp.id || seen.has(comp.id)) continue;
    seen.add(comp.id);
    out.push({
      id: comp.id,
      nom: comp.nom,
      logo_url: comp.logo_url,
      role_user: e.role === 'co_pdg' ? 'co_pdg' : 'employe',
    });
  }

  // Tri : PDG d'abord, puis co-PDG, puis employe ; alphabetique pour ex aequo
  const rolePriority: Record<CompagnieAvecLogo['role_user'], number> = {
    pdg: 0,
    co_pdg: 1,
    employe: 2,
  };
  out.sort((a, b) => {
    const dr = rolePriority[a.role_user] - rolePriority[b.role_user];
    if (dr !== 0) return dr;
    return a.nom.localeCompare(b.nom, 'fr');
  });

  return out;
}

/**
 * Calcule le logo a appliquer sur la carte selon la source configuree.
 * Retourne aussi la compagnie effectivement choisie (utile pour `organisation`).
 */
export async function resolveCarteLogo(
  admin: SupabaseClient,
  userId: string,
  source: LogoSource,
  logoCompagnieId: string | null,
  preserveLogoUrl: string | null
): Promise<{ logo_url: string | null; logo_compagnie_id: string | null; logo_source: LogoSource; compagnie_nom: string | null }> {
  if (source === 'manuel') {
    return { logo_url: preserveLogoUrl, logo_compagnie_id: null, logo_source: 'manuel', compagnie_nom: null };
  }
  if (source === 'aucun') {
    return { logo_url: null, logo_compagnie_id: null, logo_source: 'aucun', compagnie_nom: null };
  }
  if (source === 'compagnie' && logoCompagnieId) {
    // Verifie que l'user est toujours rattache a cette compagnie
    const compagnies = await getCompagniesAvecLogoForUser(admin, userId);
    const match = compagnies.find((c) => c.id === logoCompagnieId);
    if (match) {
      return { logo_url: match.logo_url, logo_compagnie_id: match.id, logo_source: 'compagnie', compagnie_nom: match.nom };
    }
    // Si l'user n'est plus dans cette compagnie, on retombe sur 'auto'
  }

  // Mode 'auto' : PDG > premier employeur
  const compagnies = await getCompagniesAvecLogoForUser(admin, userId);
  const auto = compagnies.find((c) => Boolean(c.logo_url)) ?? compagnies[0] ?? null;
  return {
    logo_url: auto?.logo_url ?? null,
    logo_compagnie_id: null,
    logo_source: 'auto',
    compagnie_nom: auto?.nom ?? null,
  };
}
