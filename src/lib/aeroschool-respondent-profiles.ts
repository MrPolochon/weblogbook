import type { SupabaseClient } from '@supabase/supabase-js';

export type AeroSchoolRespondentCarte = {
  couleur_fond: string;
  logo_url: string | null;
  photo_url: string | null;
  titre: string;
  sous_titre: string | null;
  nom_affiche: string | null;
  organisation: string | null;
  numero_carte: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  cases_haut: string[];
  cases_bas: string[];
};

export type AeroSchoolRespondentProfile = {
  identifiant: string;
  discord_username: string | null;
  carte: AeroSchoolRespondentCarte | null;
};

const CARTE_SELECT =
  'couleur_fond, logo_url, photo_url, titre, sous_titre, nom_affiche, organisation, numero_carte, date_delivrance, date_expiration, cases_haut, cases_bas';

function normalizeCarte(row: Record<string, unknown> | null | undefined): AeroSchoolRespondentCarte | null {
  if (!row) return null;
  return {
    couleur_fond: (row.couleur_fond as string) || '#1E3A8A',
    logo_url: (row.logo_url as string | null) ?? null,
    photo_url: (row.photo_url as string | null) ?? null,
    titre: (row.titre as string) || "Carte d'identification de membre d'equipage",
    sous_titre: (row.sous_titre as string | null) ?? null,
    nom_affiche: (row.nom_affiche as string | null) ?? null,
    organisation: (row.organisation as string | null) ?? null,
    numero_carte: (row.numero_carte as string | null) ?? null,
    date_delivrance: (row.date_delivrance as string | null) ?? null,
    date_expiration: (row.date_expiration as string | null) ?? null,
    cases_haut: Array.isArray(row.cases_haut) ? (row.cases_haut as string[]) : [],
    cases_bas: Array.isArray(row.cases_bas) ? (row.cases_bas as string[]) : [],
  };
}

/** Charge identifiant, Discord et carte d'identité pour une liste de user_id (admin AeroSchool). */
export async function loadAeroSchoolRespondentProfiles(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AeroSchoolRespondentProfile>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, AeroSchoolRespondentProfile>();
  if (uniqueIds.length === 0) return map;

  const [profilesRes, discordRes, cartesRes] = await Promise.all([
    admin.from('profiles').select('id, identifiant').in('id', uniqueIds),
    admin.from('discord_links').select('user_id, discord_username').in('user_id', uniqueIds),
    admin.from('cartes_identite').select(`user_id, ${CARTE_SELECT}`).in('user_id', uniqueIds),
  ]);

  const identifiantById = new Map(
    (profilesRes.data || []).map((p) => [p.id as string, (p.identifiant as string) || '']),
  );
  const discordById = new Map(
    (discordRes.data || []).map((d) => [d.user_id as string, (d.discord_username as string | null) ?? null]),
  );
  const carteById = new Map(
    (cartesRes.data || []).map((c) => [c.user_id as string, normalizeCarte(c)]),
  );

  for (const id of uniqueIds) {
    map.set(id, {
      identifiant: identifiantById.get(id) || id.slice(0, 8),
      discord_username: discordById.get(id) ?? null,
      carte: carteById.get(id) ?? null,
    });
  }

  return map;
}
