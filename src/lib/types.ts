export type Role = 'admin' | 'pilote' | 'atc' | 'ifsa' | 'siavi' | 'ground_crew';

// ── Ground Crew types ─────────────────────────────────────────────────────────
export type GateType = 'light' | 'medium' | 'heavy' | 'super_heavy' | 'helicopter' | 'cargo' | 'general_aviation' | 'unrestricted' | 'special';
export type AircraftSize = 'light' | 'medium' | 'heavy' | 'super_heavy';
export type ServiceType = 'bagages' | 'catering' | 'fuel' | 'boarding' | 'repoussage' | 'marshalling';
export type ServiceStatut = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'ground_crew_unavailable';
export type GateStatus = 'reserved' | 'occupied' | 'released';
export type AssignmentType = 'depart' | 'arrivee';
export type BoardingStatut = 'not_started' | 'in_progress' | 'completed';

export interface GroundSession {
  id: string;
  user_id: string;
  aeroport: string;
  started_at: string;
  profiles?: { identifiant: string } | null;
}

export interface AirportGate {
  id: string;
  aeroport: string;
  gate_code: string;
  gate_type: GateType;
  max_aircraft_size: AircraftSize | null;
  terminal: string | null;
  reserved_for: string | null;
  requires_separation: boolean;
  notes: string | null;
  display_order: number | null;
  created_at: string;
}

export interface GateAssignment {
  id: string;
  plan_vol_id: string;
  aeroport: string;
  gate_id: string;
  assignment_type: AssignmentType;
  assigned_at: string;
  expires_at: string | null;
  status: GateStatus;
  gate?: AirportGate | null;
}

export interface CompanyGatePriority {
  id: string;
  compagnie_id: string;
  aeroport: string;
  gate_id: string;
  priority_level: number;
  prix_paye: number | null;
  expires_at: string;
  created_at: string;
  gate?: AirportGate | null;
  compagnie?: { nom: string } | null;
}

export interface CompagnieGatePreference {
  id: string;
  compagnie_id: string;
  aeroport: string;
  gate_id: string;
  created_at: string;
  gate?: AirportGate | null;
}

export interface GroundServiceRequest {
  id: string;
  plan_vol_id: string;
  pilote_id: string;
  aeroport: string;
  service_type: ServiceType;
  statut: ServiceStatut;
  accepted_by: string | null;
  requested_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  pax_count: number | null;
  score_minijeu: number | null;
  montant_paye: number | null;
  notes: string | null;
  direction?: 'gauche' | 'droite' | null;
  pilote_confirme?: boolean | null;
  team_id?: string | null;
  pilote?: { identifiant: string } | null;
  accepteur?: { identifiant: string } | null;
  plan_vol?: { numero_vol: string; aeroport_depart: string; aeroport_arrivee: string } | null;
}

// ── Ground Crew Teams ─────────────────────────────────────────────────────────
export interface GroundTeam {
  id: string;
  aeroport: string;
  created_by: string;
  created_at: string;
  disbanded_at: string | null;
}

export interface GroundTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  profile?: { identifiant: string } | null;
  online?: boolean;
  score_moyen?: number;
}

export interface GroundTeamInvitation {
  id: string;
  team_id: string;
  from_user_id: string;
  to_user_id: string;
  aeroport: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  expires_at: string;
  from_profile?: { identifiant: string } | null;
  to_profile?: { identifiant: string } | null;
}

export interface GroundServiceContribution {
  id: string;
  service_request_id: string;
  user_id: string;
  score_minijeu: number;
  montant_percu: number;
  completed_at: string;
}

export interface BoardingStatus {
  id: string;
  plan_vol_id: string;
  total_pax: number;
  pax_embarques: number;
  statut: BoardingStatut;
  started_at: string | null;
  completed_at: string | null;
  ground_crew_id: string | null;
}
export type VolStatut = 'en_attente' | 'validé' | 'refusé';
export type TypeVol = 'IFR' | 'VFR';
export type RolePilote = 'Pilote' | 'Co-pilote';
export type PlanStatut = 'depose' | 'en_attente' | 'accepte' | 'refuse' | 'en_cours' | 'automonitoring' | 'en_attente_cloture' | 'cloture' | 'annule' | 'planifie_suivant' | 'en_pause';
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
  temps_prev_min?: number;
  refusal_reason?: string | null;
  
  // Transpondeur
  code_transpondeur?: string | null;
  mode_transpondeur?: 'C' | 'S' | null;
  
  // Type de vol
  vol_commercial?: boolean;
  vol_ferry?: boolean;
  vol_militaire?: boolean;
  nature_transport?: NatureTransport | null;
  type_cargaison?: TypeCargaison | null;
  type_cargaison_libelle?: string | null;
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

  // MEDEVAC multi-segments
  siavi_avion_id?: string | null;
  medevac_mission_id?: string | null;
  medevac_segment_index?: number | null;
  medevac_total_segments?: number | null;
  medevac_next_plan_id?: string | null;

  /** Lien carte mission armée (si plan déposé pour une mission + flotte armée). */
  armee_mission_id?: string | null;

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
  updated_at?: string;
  pdg_id?: string | null;
  prix_billet_pax?: number;
  prix_kg_cargo?: number;
  pourcentage_salaire?: number;
  vban?: string | null;
  code_oaci?: string | null;
  callsign_telephonie?: string | null;
  logo_url?: string | null;
  alliance_id?: string | null;
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
