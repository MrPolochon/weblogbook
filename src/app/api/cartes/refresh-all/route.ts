import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Hiérarchie du type de carte (priorité stricte) :
 * 1. STAFF   si role === 'admin'
 * 2. ATC     si ATC (même si pilote ou pompier aussi)
 * 3. POMPIER si SIAVI (même si pilote aussi)
 * 4. PILOTE  sinon
 * Ne modifie pas : date_delivrance, date_expiration, numero_carte, cases_haut, cases_bas, photo_url.
 */
async function getInfosCarteForProfile(
  admin: ReturnType<typeof createAdminClient>,
  profile: { id: string; identifiant: string | null; role: string | null; atc: boolean | null; siavi: boolean | null }
) {
  let couleur_fond = '#1E3A8A';
  let titre = "Carte d'identification de membre d'équipage";
  let organisation = 'IFSA';
  let sous_titre = "délivré par l'instance de l'IFSA";

  if (profile.role === 'admin') {
    couleur_fond = '#1F2937';
    titre = 'STAFF';
    organisation = 'Mixou Airlines';
    sous_titre = 'délivré par Mixou Airlines';
  } else if (profile.role === 'atc' || profile.atc) {
    couleur_fond = '#EA580C';
    titre = 'Opération de contrôle aérienne';
    organisation = 'Service ATS';
    sous_titre = "délivré par l'instance de l'IFSA";
  } else if (profile.siavi) {
    couleur_fond = '#DC2626';
    titre = 'Service incendie';
    organisation = 'Service Incendie Aéroportuaire et Information de Vol';
    sous_titre = "délivré par l'instance de l'IFSA";
  } else {
    const { data: emploi } = await admin
      .from('compagnie_employes')
      .select('compagnies(nom)')
      .eq('pilote_id', profile.id)
      .limit(1)
      .single();
    if (emploi?.compagnies) {
      const c = Array.isArray(emploi.compagnies) ? emploi.compagnies[0] : emploi.compagnies;
      if (c?.nom) organisation = c.nom;
    }
  }

  let logo_url: string | null = null;
  if (profile.role !== 'admin') {
    const { data: compPdg } = await admin.from('compagnies').select('logo_url').eq('pdg_id', profile.id).maybeSingle();
    if (compPdg?.logo_url) {
      logo_url = compPdg.logo_url;
    } else {
      const { data: compEmp } = await admin
        .from('compagnie_employes')
        .select('compagnies(logo_url)')
        .eq('pilote_id', profile.id)
        .limit(1)
        .maybeSingle();
      if (compEmp?.compagnies) {
        const c = Array.isArray(compEmp.compagnies) ? compEmp.compagnies[0] : compEmp.compagnies;
        if (c?.logo_url) logo_url = c.logo_url;
      }
    }
  }

  return {
    couleur_fond,
    titre,
    sous_titre,
    organisation,
    logo_url: logo_url || null,
    nom_affiche: profile.identifiant?.toUpperCase() || null,
  };
}

/**
 * POST - Met à jour toutes les cartes : compagnie, logo, type de carte (ATC / Pompier / Pilote / Staff).
 * Recalcule à partir du profil actuel (rôle, atc, siavi, employeur). Ne modifie pas date_delivrance ni cases.
 * Réservé aux admins.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: cartes } = await admin.from('cartes_identite').select('id, user_id');
  if (!cartes?.length) {
    return NextResponse.json({ ok: true, updated: 0, message: 'Aucune carte à mettre à jour.' });
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

    const infos = await getInfosCarteForProfile(admin, {
      id: p.id,
      identifiant: p.identifiant ?? null,
      role: p.role ?? null,
      atc: p.atc ?? null,
      siavi: p.siavi ?? null,
    });

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
    message: `${updated} carte(s) mise(s) à jour (compagnie, logo, type ATC/Pompier/Pilote/Staff).`,
  });
}
