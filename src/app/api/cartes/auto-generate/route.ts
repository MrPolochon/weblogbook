import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { resolveCarteLogo } from '@/lib/cartes/logo-resolver';

export const dynamic = 'force-dynamic';

// Genere un numero de carte unique
async function generateUniqueCardNumber(admin: ReturnType<typeof createAdminClient>, prefix: string): Promise<string> {
  const { data: cartes } = await admin
    .from('cartes_identite')
    .select('numero_carte')
    .like('numero_carte', `${prefix}%`)
    .order('numero_carte', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (cartes && cartes.length > 0 && cartes[0].numero_carte) {
    const match = cartes[0].numero_carte.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix} ${String(nextNumber).padStart(6, '0')}`;
}

// POST - Genere automatiquement une carte pour un utilisateur selon son role
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const body = await request.json();
  const targetUserId = body.user_id || user.id;

  const admin = createAdminClient();

  const { data: existingCarte } = await admin
    .from('cartes_identite')
    .select('id')
    .eq('user_id', targetUserId)
    .single();

  if (existingCarte) {
    return NextResponse.json({ error: 'Une carte existe deja', exists: true }, { status: 400 });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, identifiant, role, atc, siavi, ifsa')
    .eq('id', targetUserId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
  }

  // Hierarchie type de carte (priorite stricte) : STAFF > ATC > POMPIER > PILOTE
  let couleur_fond = '#1E3A8A';
  let titre = "Carte d'identification de membre d'equipage";
  let organisation = 'IFSA';
  let numero_prefix = 'PIL';
  let sous_titre = "delivre par l'instance de l'IFSA";

  if (profile.role === 'admin') {
    couleur_fond = '#1F2937';
    titre = 'STAFF';
    organisation = 'Mixou Airlines';
    numero_prefix = 'STAFF M';
    sous_titre = 'delivre par Mixou Airlines';
  } else if (profile.role === 'atc' || profile.atc) {
    couleur_fond = '#EA580C';
    titre = 'Operation de controle aerienne';
    organisation = 'Service ATS';
    numero_prefix = 'ATC';
    sous_titre = "delivre par l'instance de l'IFSA";
  } else if (profile.siavi) {
    couleur_fond = '#DC2626';
    titre = 'Service incendie';
    organisation = 'Service Incendie Aeroportuaire et Information de Vol';
    numero_prefix = 'SIAVI';
    sous_titre = "delivre par l'instance de l'IFSA";
  }

  // Logo : auto, sauf pour admin (staff = pas de logo compagnie)
  let logo_url: string | null = null;
  let logo_source: 'auto' | 'aucun' = 'aucun';
  let logo_compagnie_id: string | null = null;

  if (profile.role !== 'admin') {
    const resolved = await resolveCarteLogo(admin, targetUserId, 'auto', null, null);
    logo_url = resolved.logo_url;
    logo_compagnie_id = resolved.logo_compagnie_id;
    logo_source = 'auto';
    // Si pilote sans rang ATC/SIAVI, l'organisation devient le nom de la compagnie
    if (titre === "Carte d'identification de membre d'equipage" && resolved.compagnie_nom) {
      organisation = resolved.compagnie_nom;
    }
  }

  const numero_carte = await generateUniqueCardNumber(admin, numero_prefix);

  const { data: newCarte, error } = await admin
    .from('cartes_identite')
    .insert({
      user_id: targetUserId,
      couleur_fond,
      logo_url,
      logo_source,
      logo_compagnie_id,
      titre,
      sous_titre,
      nom_affiche: profile.identifiant?.toUpperCase() || null,
      organisation,
      numero_carte,
      date_delivrance: new Date().toISOString().split('T')[0],
      cases_haut: [],
      cases_bas: [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: newCarte, ok: true });
}
