export type MinigameType = 'bagages' | 'catering' | 'fuel' | 'boarding' | 'degivrage' | 'checklist' | 'marshalling';

export interface MinigameConfig {
  id: MinigameType;
  name: string;
  description: string;
  duree_secondes: number;
  paiement_base: number;
  instructions: string;
}

export const MINIGAMES: Record<MinigameType, MinigameConfig> = {
  bagages: {
    id: 'bagages',
    name: 'Chargement bagages',
    description: 'Cliquez les colis — évitez les fragiles en premier !',
    duree_secondes: 30,
    paiement_base: 2000,
    instructions:
      'Des colis tombent sur la piste. Cliquez dessus avant qu\'ils disparaissent. Les colis fragiles (🏺 🔮 🪴) pénalisent -0.2 si cliqués quand des colis normaux sont encore là.',
  },
  catering: {
    id: 'catering',
    name: 'Service catering',
    description: 'Mémorisez la séquence — évitez les intrus en Hard !',
    duree_secondes: 45,
    paiement_base: 1500,
    instructions:
      'Une séquence de plats s\'affiche. Reproduisez-la dans l\'ordre. Mode Difficile : des plats intrus (🚫) sont dans la grille — les cliquer coûte des points.',
  },
  fuel: {
    id: 'fuel',
    name: 'Ravitaillement carburant',
    description: 'Arrêtez la jauge oscillante dans la zone verte — 3 chances',
    duree_secondes: 20,
    paiement_base: 1800,
    instructions:
      'La jauge oscille (deux fréquences). Appuyez sur Espace ou cliquez quand l\'aiguille est dans la zone verte (±5%). Vous avez 3 tentatives — le meilleur score est retenu.',
  },
  boarding: {
    id: 'boarding',
    name: 'Boarding passagers',
    description: 'VIP en premier · Business · Premium · Economy (arrière→avant)',
    duree_secondes: 60,
    paiement_base: 100,
    instructions:
      'Embarquez dans l\'ordre : VIP ⭐ → Business → Premium → Economy. En Economy, validez les rangées les plus hautes en premier (arrière de l\'avion).',
  },
  degivrage: {
    id: 'degivrage',
    name: 'Dégivrage aile',
    description: 'Grattez toute la glace avant la fin du chrono',
    duree_secondes: 45,
    paiement_base: 2500,
    instructions:
      'Maintenez le clic et faites glisser sur les cellules bleues (glace) pour les dégivrer. Traitez un maximum de surface en 45 secondes.',
  },
  checklist: {
    id: 'checklist',
    name: 'Checklist pré-vol',
    description: 'Mémorisez l\'ordre réglementaire, puis cochez dans l\'ordre',
    duree_secondes: 60,
    paiement_base: 2000,
    instructions:
      'L\'ordre réglementaire des 10 items s\'affiche pendant 5 secondes. Mémorisez-le, puis cochez les items dans le bon ordre réglementaire.',
  },
  marshalling: {
    id: 'marshalling',
    name: 'Marshalling',
    description: 'Guidez l\'avion vers le parking avec les bons signaux',
    duree_secondes: 40,
    paiement_base: 2200,
    instructions:
      'Un signal de marshalling s\'affiche (flèche ou STOP). Appuyez sur la touche correspondante dans les 3 secondes. Séquence de 7 signaux — terminez par STOP.',
  },
};

/**
 * Calcule le score du mini-jeu bagages.
 * Score = (clics réussis / total apparitions) × (temps restant / durée totale)
 */
export function calculerScoreBagages(clicsReussis: number, totalApparitions: number, tempsRestant: number, dureeTotale: number): number {
  if (totalApparitions <= 0) return 0;
  const precisionScore = clicsReussis / totalApparitions;
  const vitesseScore = Math.max(0, tempsRestant) / dureeTotale;
  return Math.max(0, Math.min(1, (precisionScore * 0.7 + vitesseScore * 0.3)));
}

/**
 * Calcule le score du mini-jeu catering.
 * Score = (bonnes réponses dans l'ordre / longueur séquence)
 */
export function calculerScoreCatering(bonnesReponses: number, longueurSequence: number): number {
  if (longueurSequence <= 0) return 0;
  return Math.max(0, Math.min(1, bonnesReponses / longueurSequence));
}

/**
 * Calcule le score du mini-jeu fuel.
 * Score basé sur l'écart en % par rapport à la zone verte (±5%).
 * Écart 0% → score 1.0 ; écart ≥10% → score 0
 */
export function calculerScoreFuel(valeurArret: number, cibleMin: number, cibleMax: number): number {
  const cible = (cibleMin + cibleMax) / 2;
  const tolerance = (cibleMax - cibleMin) / 2;
  const ecart = Math.abs(valeurArret - cible);
  if (ecart <= tolerance) return 1.0;
  if (ecart >= tolerance * 3) return 0;
  return Math.max(0, 1 - (ecart - tolerance) / (tolerance * 2));
}

/**
 * Calcule le score du mini-jeu boarding.
 * Score = (validations dans le bon ordre / total passagers)
 */
export function calculerScoreBoarding(validationsCorrectes: number, totalPassagers: number): number {
  if (totalPassagers <= 0) return 0;
  return Math.max(0, Math.min(1, validationsCorrectes / totalPassagers));
}

/** Durée de boarding estimée selon pax_count (3s par passager, min 30s) */
export function getDureeBoarding(paxCount: number): number {
  return Math.max(30, paxCount * 3);
}

/** Couleur CSS Tailwind par classe de passager pour le boarding */
export const BOARDING_CLASS_COLORS: Record<'business' | 'premium' | 'economy', string> = {
  business: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  premium:  'bg-slate-400/20 text-slate-300 border-slate-400/40',
  economy:  'bg-sky-500/20 text-sky-300 border-sky-500/40',
};

/** Génère un jeu de cartes de boarding aléatoires */
export function genererCartesBoarding(paxCount: number): Array<{ id: number; classe: 'business' | 'premium' | 'economy'; nom: string; siege: string }> {
  const nbBusiness = Math.max(1, Math.floor(paxCount * 0.1));
  const nbPremium  = Math.max(1, Math.floor(paxCount * 0.2));
  const nbEconomy  = paxCount - nbBusiness - nbPremium;

  const noms = ['MARTIN', 'DURAND', 'PETIT', 'SIMON', 'BLANC', 'GARCIA', 'THOMAS', 'ROBERT', 'LEROY', 'RICHARD', 'LEBLANC', 'DUPONT', 'MOREAU', 'FAURE', 'GIRARD'];

  const cartes: Array<{ id: number; classe: 'business' | 'premium' | 'economy'; nom: string; siege: string }> = [];
  let id = 0;

  for (let i = 0; i < nbBusiness; i++) {
    cartes.push({ id: id++, classe: 'business', nom: noms[id % noms.length], siege: `1${String.fromCharCode(65 + (i % 6))}` });
  }
  for (let i = 0; i < nbPremium; i++) {
    cartes.push({ id: id++, classe: 'premium', nom: noms[id % noms.length], siege: `${10 + i}${String.fromCharCode(65 + (i % 6))}` });
  }
  for (let i = 0; i < nbEconomy; i++) {
    cartes.push({ id: id++, classe: 'economy', nom: noms[id % noms.length], siege: `${20 + i}${String.fromCharCode(65 + (i % 6))}` });
  }

  // Mélanger
  return cartes.sort(() => Math.random() - 0.5);
}
