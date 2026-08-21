/**
 * Requête partagée des plans de vol pour les vues sol (ground crew, portes, ATC parkings).
 *
 * `plans_vol` ne possède ni colonne `callsign`, ni `immatriculation`, ni `type_avion` :
 *  - l'indicatif du vol est `numero_vol` ;
 *  - l'immatriculation et le type d'appareil vivent sur la table d'avion référencée
 *    (`compagnie_avions`, `inventaire_avions` ou `siavi_avions`) via `types_avion`.
 */

export const PLAN_VOL_SOL_SELECT = `
  id, numero_vol, porte, statut, aeroport_depart, aeroport_arrivee, pilote_id, created_at,
  compagnie_avion:compagnie_avion_id ( immatriculation, type_avion:types_avion ( nom, code_oaci ) ),
  inventaire_avion:inventaire_avion_id ( immatriculation, type_avion:types_avion ( nom, code_oaci ) ),
  siavi_avion:siavi_avion_id ( immatriculation, type_avion:types_avion ( nom, code_oaci ) )
`;

type TypeAvionLie = { nom: string | null; code_oaci: string | null } | null;

type AvionLie = {
  immatriculation: string | null;
  type_avion: TypeAvionLie | TypeAvionLie[];
} | null;

export type PlanVolSolRow = {
  id: string;
  numero_vol: string | null;
  porte: string | null;
  statut: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  pilote_id: string;
  created_at: string;
  compagnie_avion?: AvionLie | AvionLie[];
  inventaire_avion?: AvionLie | AvionLie[];
  siavi_avion?: AvionLie | AvionLie[];
};

/** Forme exposée aux vues sol : `callsign` est l'alias historique de `numero_vol`. */
export type PlanVolSol = {
  id: string;
  callsign: string | null;
  numero_vol: string | null;
  immatriculation: string | null;
  porte: string | null;
  statut: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_avion: string | null;
  pilote_id: string;
  created_at: string;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Aplatit une ligne `plans_vol` + relations avion vers la forme attendue par les vues sol.
 * Priorité de résolution de l'appareil : compagnie > inventaire > SIAVI.
 */
export function mapPlanVolSol(row: PlanVolSolRow): PlanVolSol {
  const avion =
    unwrap(row.compagnie_avion) ?? unwrap(row.inventaire_avion) ?? unwrap(row.siavi_avion);
  const typeAvion = avion ? unwrap(avion.type_avion) : null;

  return {
    id: row.id,
    callsign: row.numero_vol ?? null,
    numero_vol: row.numero_vol ?? null,
    immatriculation: avion?.immatriculation ?? null,
    porte: row.porte ?? null,
    statut: row.statut,
    aeroport_depart: row.aeroport_depart,
    aeroport_arrivee: row.aeroport_arrivee,
    type_avion: typeAvion?.code_oaci ?? typeAvion?.nom ?? null,
    pilote_id: row.pilote_id,
    created_at: row.created_at,
  };
}
