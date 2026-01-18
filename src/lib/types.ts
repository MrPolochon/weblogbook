export type Role = 'admin' | 'pilote';
export type VolStatut = 'en_attente' | 'validé' | 'refusé';
export type TypeVol = 'IFR' | 'VFR';
export type RolePilote = 'Pilote' | 'Co-pilote';

export interface Profile {
  id: string;
  identifiant: string;
  role: Role;
  heures_initiales_minutes: number;
  blocked_until: string | null;
  block_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Compagnie {
  id: string;
  nom: string;
  created_at: string;
}

export interface TypeAvion {
  id: string;
  nom: string;
  constructeur: string;
  ordre: number;
}

export interface Vol {
  id: string;
  pilote_id: string;
  type_avion_id: string;
  compagnie_id: string | null;
  compagnie_libelle: string;
  duree_minutes: number;
  depart_utc: string;
  arrivee_utc: string;
  type_vol: TypeVol;
  commandant_bord: string;
  role_pilote: RolePilote;
  statut: VolStatut;
  refusal_count: number;
  refusal_reason: string | null;
  editing_by_pilot_id: string | null;
  editing_started_at: string | null;
  created_by_admin: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  type_avion?: TypeAvion;
  pilote?: Profile;
}

export interface DocumentSection {
  id: string;
  nom: string;
  ordre: number;
  created_at: string;
  updated_at: string;
  files?: DocumentFile[];
}

export interface DocumentFile {
  id: string;
  section_id: string;
  nom_original: string;
  storage_path: string;
  taille_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}
