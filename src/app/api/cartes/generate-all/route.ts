import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Génère un numéro de carte unique
async function generateUniqueCardNumber(admin: ReturnType<typeof createAdminClient>, prefix: string, existingNumbers: Set<string>): Promise<string> {
  // Trouver le prochain numéro disponible
  let nextNumber = 1;
  let candidate = `${prefix} ${String(nextNumber).padStart(6, '0')}`;
  
  while (existingNumbers.has(candidate)) {
    nextNumber++;
    candidate = `${prefix} ${String(nextNumber).padStart(6, '0')}`;
  }
  
  existingNumbers.add(candidate);
  return candidate;
}

// POST - Génère les cartes pour tous les utilisateurs qui n'en ont pas (admin only)
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Vérifier admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Récupérer tous les utilisateurs qui n'ont pas de carte
  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, identifiant, role, atc, siavi, ifsa');

  const { data: existingCartes } = await admin
    .from('cartes_identite')
    .select('user_id, numero_carte');

  const existingUserIds = new Set((existingCartes || []).map(c => c.user_id));
  const existingNumbers = new Set((existingCartes || []).filter(c => c.numero_carte).map(c => c.numero_carte as string));

  const profilesToGenerate = (allProfiles || []).filter(p => !existingUserIds.has(p.id));

  if (profilesToGenerate.length === 0) {
    return NextResponse.json({ message: 'Toutes les cartes existent déjà', generated: 0 });
  }

  // Récupérer les compagnies des pilotes
  const { data: emplois } = await admin
    .from('compagnie_employes')
    .select('pilote_id, compagnies(nom)');

  const compagnieByPilote = new Map<string, string>();
  (emplois || []).forEach(e => {
    if (e.compagnies) {
      const compagnie = Array.isArray(e.compagnies) ? e.compagnies[0] : e.compagnies;
      if (compagnie?.nom) {
        compagnieByPilote.set(e.pilote_id, compagnie.nom);
      }
    }
  });

  const cartesToInsert = [];
  const today = new Date().toISOString().split('T')[0];

  for (const p of profilesToGenerate) {
    let couleur_fond = '#1E3A8A'; // Bleu par défaut (pilote)
    let titre = "Carte d'identification de membre d'équipage"; // Pilote par défaut
    let organisation = 'IFSA';
    let numero_prefix = 'PIL';
    let sous_titre = "délivré par l'instance de l'IFSA";

    // Admin
    if (p.role === 'admin') {
      couleur_fond = '#1F2937';
      titre = 'STAFF';
      organisation = 'Mixou Airlines';
      numero_prefix = 'STAFF M';
      sous_titre = 'délivré par Mixou Airlines';
    }
    // ATC
    else if (p.role === 'atc' || p.atc) {
      couleur_fond = '#EA580C';
      titre = 'Opération de contrôle aérienne';
      organisation = 'Service ATS';
      numero_prefix = 'ATC';
      sous_titre = "délivré par l'instance de l'IFSA";
    }
    // SIAVI (Pompier)
    else if (p.siavi) {
      couleur_fond = '#DC2626';
      titre = 'Service incendie';
      organisation = 'Service Incendie Aéroportuaire et Information de Vol';
      numero_prefix = 'SIAVI';
      sous_titre = "délivré par l'instance de l'IFSA";
    }
    // Pilote - récupérer la compagnie
    else {
      const compagnieNom = compagnieByPilote.get(p.id);
      if (compagnieNom) {
        organisation = compagnieNom;
      }
    }

    const numero_carte = await generateUniqueCardNumber(admin, numero_prefix, existingNumbers);

    cartesToInsert.push({
      user_id: p.id,
      couleur_fond,
      titre,
      sous_titre,
      nom_affiche: p.identifiant?.toUpperCase() || null,
      organisation,
      numero_carte,
      date_delivrance: today,
      cases_haut: [],
      cases_bas: [],
    });
  }

  // Insérer toutes les cartes
  const { error } = await admin
    .from('cartes_identite')
    .insert(cartesToInsert);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    message: `${cartesToInsert.length} cartes générées avec succès`,
    generated: cartesToInsert.length,
    details: cartesToInsert.map(c => ({ user: c.nom_affiche, numero: c.numero_carte, titre: c.titre }))
  });
}
