import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { resolveCarteLogo, type LogoSource } from '@/lib/cartes/logo-resolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Hierarchie du type de carte (priorite stricte) :
 * 1. STAFF   si role === 'admin'
 * 2. ATC     si ATC (meme si pilote ou pompier aussi)
 * 3. POMPIER si SIAVI (meme si pilote aussi)
 * 4. PILOTE  sinon
 *
 * Le logo est calcule via resolveCarteLogo et respecte le choix utilisateur :
 *  - 'manuel' : logo_url et organisation NE SONT PAS modifies (admin/IFSA a fige)
 *  - 'auto', 'compagnie', 'aucun' : recalcule selon les compagnies actuelles
 *
 * Ne modifie pas : date_delivrance, date_expiration, numero_carte, cases_haut, cases_bas, photo_url.
 */
async function getInfosCarteForProfile(
  admin: ReturnType<typeof createAdminClient>,
  profile: { id: string; identifiant: string | null; role: string | null; atc: boolean | null; siavi: boolean | null },
  carte: { logo_source: LogoSource | null; logo_compagnie_id: string | null; logo_url: string | null; organisation: string | null }
) {
  let couleur_fond = '#1E3A8A';
  let titre = "Carte d'identification de membre d'equipage";
  let organisation: string | null = 'IFSA';
  let sous_titre = "delivre par l'instance de l'IFSA";

  if (profile.role === 'admin') {
    couleur_fond = '#1F2937';
    titre = 'STAFF';
    organisation = 'Mixou Airlines';
    sous_titre = 'delivre par Mixou Airlines';
  } else if (profile.role === 'atc' || profile.atc) {
    couleur_fond = '#EA580C';
    titre = 'Operation de controle aerienne';
    organisation = 'Service ATS';
    sous_titre = "delivre par l'instance de l'IFSA";
  } else if (profile.siavi) {
    couleur_fond = '#DC2626';
    titre = 'Service incendie';
    organisation = 'Service Incendie Aeroportuaire et Information de Vol';
    sous_titre = "delivre par l'instance de l'IFSA";
  } else {
    organisation = null; // sera fixe par le logo resolver si dispo
  }

  const source = (carte.logo_source ?? 'auto') as LogoSource;
  let logo_url = carte.logo_url ?? null;
  let logo_compagnie_id = carte.logo_compagnie_id;
  let logo_source: LogoSource = source;

  // Pour les admins (STAFF) : pas de logo compagnie en mode auto
  const skipLogoForAdmin = profile.role === 'admin' && source === 'auto';

  if (source === 'manuel') {
    // Ne touche pas au logo deja fige par admin/IFSA
  } else if (skipLogoForAdmin) {
    logo_url = null;
    logo_compagnie_id = null;
  } else {
    const resolved = await resolveCarteLogo(admin, profile.id, source, logo_compagnie_id, logo_url);
    logo_url = resolved.logo_url;
    logo_compagnie_id = resolved.logo_compagnie_id;
    logo_source = resolved.logo_source;
    // Pour les pilotes (titre par defaut), si on a un nom de compagnie, l'utiliser
    if (titre === "Carte d'identification de membre d'equipage" && resolved.compagnie_nom) {
      organisation = resolved.compagnie_nom;
    }
  }

  if (organisation === null) organisation = 'IFSA';

  return {
    couleur_fond,
    titre,
    sous_titre,
    organisation,
    logo_url,
    logo_source,
    logo_compagnie_id,
    nom_affiche: profile.identifiant?.toUpperCase() || null,
  };
}

/**
 * POST - Met a jour toutes les cartes : compagnie, logo, type de carte (ATC / Pompier / Pilote / Staff).
 * Recalcule a partir du profil actuel et du choix de logo (auto/compagnie/manuel/aucun).
 * Ne modifie pas date_delivrance ni cases.
 * Reserve aux admins.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Reserve aux admins' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: cartes } = await admin
    .from('cartes_identite')
    .select('id, user_id, logo_source, logo_compagnie_id, logo_url, organisation');

  if (!cartes?.length) {
    return NextResponse.json({ ok: true, updated: 0, message: 'Aucune carte a mettre a jour.' });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, identifiant, role, atc, siavi')
    .in('id', cartes.map((c) => c.user_id));

  const profileById = new Map((profiles || []).map((p) => [p.id, p]));
  let updated = 0;
  const nowIso = new Date().toISOString();

  for (const carte of cartes) {
    const p = profileById.get(carte.user_id);
    if (!p) continue;

    const infos = await getInfosCarteForProfile(
      admin,
      {
        id: p.id,
        identifiant: p.identifiant ?? null,
        role: p.role ?? null,
        atc: p.atc ?? null,
        siavi: p.siavi ?? null,
      },
      {
        logo_source: (carte.logo_source as LogoSource | null) ?? null,
        logo_compagnie_id: carte.logo_compagnie_id ?? null,
        logo_url: carte.logo_url ?? null,
        organisation: carte.organisation ?? null,
      }
    );

    const { error } = await admin
      .from('cartes_identite')
      .update({
        ...infos,
        updated_at: nowIso,
      })
      .eq('id', carte.id);

    if (!error) updated++;
  }

  return NextResponse.json({
    ok: true,
    updated,
    total: cartes.length,
    message: `${updated} carte(s) mise(s) a jour (compagnie, logo, type ATC/Pompier/Pilote/Staff).`,
  });
}
