import type { AeroSchoolRespondentCarte } from '@/lib/aeroschool-respondent-profiles';

/** Valeurs par défaut alignées sur CarteIdentite quand aucune carte n'est en BDD. */
export function defaultCarteForIdentifiant(identifiant: string): AeroSchoolRespondentCarte {
  return {
    couleur_fond: '#1E3A8A',
    logo_url: null,
    photo_url: null,
    titre: 'IFSA',
    sous_titre: "délivré par l'instance de l'IFSA",
    nom_affiche: identifiant || '—',
    organisation: 'IFSA',
    numero_carte: '000 00 000000',
    date_delivrance: null,
    date_expiration: null,
    cases_haut: [],
    cases_bas: [],
  };
}
