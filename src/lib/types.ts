export type Role = 'admin' | 'pilote' | 'atc' | 'ifsa' | 'siavi';
export type VolStatut = 'en_attente' | 'validé' | 'refusé';
export type TypeVol = 'IFR' | 'VFR';
export type RolePilote = 'Pilote' | 'Co-pilote';
export type PlanStatut = 'depose' | 'en_attente' | 'accepte' | 'refuse' | 'en_cours' | 'automonitoring' | 'en_attente_cloture' | 'cloture';
export type NatureTransport = 'passagers' | 'cargo' | 'mixte';
export type TypeCargaison = 'generale' | 'dangereuse' | 'perissable' | 'vivante' | 'urgente';

export interface PlanVol {
  id: string;
  numero_vol: string;
  pilote_id: string;
  copilote_id?: string | null;
  compagnie_id?: string | null;
  compagnie_avion_id?: string | null;
  type_vol: TypeVol;
  aeroport_depart: string;
  aeroport_arrivee: string;
  altitude_croisiere?: number | null;
  vitesse_croisiere?: number | null;
  route?: string | null;
  duree_estimee_minutes?: number | null;
  carburant_minutes?: number | null;
  callsign?: string | null;
  statut: PlanStatut;
  
  // Transpondeur
  code_transpondeur?: string | null;
  mode_transpondeur?: 'C' | 'S' | null;
  
  // Type de vol
  vol_commercial?: boolean;
  vol_ferry?: boolean;
  vol_militaire?: boolean;
  nature_transport?: NatureTransport | null;
  type_cargaison?: TypeCargaison | null;
  nb_pax_genere?: number | null;
  cargo_kg_genere?: number | null;
  
  // ATC
  current_holder_user_id?: string | null;
  current_holder_position?: string | null;
  current_holder_aeroport?: string | null;
  pending_transfer_aeroport?: string | null;
  instructions?: string | null;
  automonitoring?: boolean;
  accepted_at?: string | null;
  
  // Dates
  heure_depart_estimee?: string | null;
  heure_depart_reelle?: string | null;
  heure_arrivee_estimee?: string | null;
  heure_arrivee_reelle?: string | null;
  created_at: string;
  updated_at?: string;
  
  // Flight strip fields (ATC)
  sid_depart?: string | null;
  strip_atd?: string | null;
  strip_rwy?: string | null;
  strip_fl?: string | null;
  strip_fl_unit?: string | null;
  strip_sid_atc?: string | null;
  strip_note_1?: string | null;
  strip_note_2?: string | null;
  strip_note_3?: string | null;
  strip_zone?: string | null;
  strip_order?: number;

  // Relations enrichies (optionnelles)
  pilote?: { identifiant: string } | null;
  copilote?: { identifiant: string } | null;
  compagnie?: { nom: string } | null;
  avion?: { immatriculation: string; nom_bapteme?: string } | null;
}

export interface AtcSession {
  id: string;
  user_id: string;
  aeroport: string;
  position: string;
  started_at: string;
  profiles?: { identifiant: string } | null;
}

export interface Profile {
  id: string;
  identifiant: string;
  role: Role;
  heures_initiales_minutes: number;
  blocked_until: string | null;
  block_reason: string | null;
  armee: boolean;
  atc: boolean;
  siavi: boolean;
  ifsa: boolean;
  atc_grade_id: string | null;
  siavi_grade_id: string | null;
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
