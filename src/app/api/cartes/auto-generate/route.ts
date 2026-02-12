import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Génère un numéro de carte unique
async function generateUniqueCardNumber(admin: ReturnType<typeof createAdminClient>, prefix: string): Promise<string> {
  // Récupérer le dernier numéro utilisé avec ce prefix
  const { data: cartes } = await admin
    .from('cartes_identite')
    .select('numero_carte')
    .like('numero_carte', `${prefix}%`)
    .order('numero_carte', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (cartes && cartes.length > 0 && cartes[0].numero_carte) {
    // Extraire le numéro de la fin (ex: "PIL 000015" -> 15)
    const match = cartes[0].numero_carte.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  // Formater le numéro (6 chiffres)
  return `${prefix} ${String(nextNumber).padStart(6, '0')}`;
}

// POST - Génère automatiquement une carte pour un utilisateur selon son rôle
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json();
  const targetUserId = body.user_id || user.id;

  const admin = createAdminClient();

  // Vérifier si une carte existe déjà
  const { data: existingCarte } = await admin
    .from('cartes_identite')
    .select('id')
    .eq('user_id', targetUserId)
    .single();

  if (existingCarte) {
    return NextResponse.json({ error: 'Une carte existe déjà', exists: true }, { status: 400 });
  }

  // Récupérer le profil de l'utilisateur cible
  const { data: profile } = await admin
    .from('profiles')
    .select('id, identifiant, role, atc, siavi, ifsa')
    .eq('id', targetUserId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
  }

    // Déterminer les valeurs par défaut selon le rôle
    let couleur_fond = '#1E3A8A'; // Bleu par défaut (pilote)
    let titre = "Carte d'identification de membre d'équipage"; // Pilote par défaut
    let organisation = 'IFSA';
    let numero_prefix = 'PIL';
    let sous_titre = "délivré par l'instance de l'IFSA";

    // Admin
    if (profile.role === 'admin') {
      couleur_fond = '#1F2937'; // Noir/gris foncé
      titre = 'STAFF';
      organisation = 'Mixou Airlines';
      numero_prefix = 'STAFF M';
      sous_titre = 'délivré par Mixou Airlines';
    }
    // ATC
    else if (profile.role === 'atc' || profile.atc) {
      couleur_fond = '#EA580C'; // Orange
      titre = 'Opération de contrôle aérienne';
      organisation = 'Service ATS';
      numero_prefix = 'ATC';
      sous_titre = "délivré par l'instance de l'IFSA";
    }
    // SIAVI (Pompier)
    else if (profile.siavi) {
      couleur_fond = '#DC2626'; // Rouge
      titre = 'Service incendie';
      organisation = 'Service Incendie Aéroportuaire et Information de Vol';
      numero_prefix = 'SIAVI';
      sous_titre = "délivré par l'instance de l'IFSA";
    }
    // Pilote - récupérer la compagnie et son logo
    else {
      // Chercher la compagnie du pilote
      const { data: emploi } = await admin
        .from('compagnie_employes')
        .select('compagnies(nom, logo_url)')
        .eq('pilote_id', targetUserId)
        .limit(1)
        .single();

      if (emploi?.compagnies) {
        const compagnie = Array.isArray(emploi.compagnies) ? emploi.compagnies[0] : emploi.compagnies;
        if (compagnie?.nom) {
          organisation = compagnie.nom;
        }
      }
    }

    // Récupérer le logo de la compagnie si applicable (pilote, pas staff)
    let logo_url: string | null = null;
    if (profile.role !== 'admin') {
      // Chercher si le user est PDG d'une compagnie
      const { data: compPdg } = await admin
        .from('compagnies')
        .select('logo_url')
        .eq('pdg_id', targetUserId)
        .maybeSingle();
      if (compPdg?.logo_url) {
        logo_url = compPdg.logo_url;
      } else {
        // Sinon chercher la compagnie employeur
        const { data: compEmp } = await admin
          .from('compagnie_employes')
          .select('compagnies(logo_url)')
          .eq('pilote_id', targetUserId)
          .limit(1)
          .maybeSingle();
        if (compEmp?.compagnies) {
          const c = Array.isArray(compEmp.compagnies) ? compEmp.compagnies[0] : compEmp.compagnies;
          if (c?.logo_url) logo_url = c.logo_url;
        }
      }
    }

  // Générer le numéro de carte unique (sauf pour admin qui peuvent partager)
  let numero_carte: string;
  if (profile.role === 'admin') {
    // Pour les admins, générer quand même un numéro unique
    numero_carte = await generateUniqueCardNumber(admin, numero_prefix);
  } else {
    numero_carte = await generateUniqueCardNumber(admin, numero_prefix);
  }

  // Créer la carte
  const { data: newCarte, error } = await admin
    .from('cartes_identite')
    .insert({
      user_id: targetUserId,
      couleur_fond,
      logo_url: logo_url || null,
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
