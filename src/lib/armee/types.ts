export type EscadrilleOuEscadron = 'escadrille' | 'escadron' | 'autre';

export type NatureVolMilitaire =
  | 'entrainement'
  | 'escorte'
  | 'sauvetage'
  | 'reconnaissance'
  | 'autre';

export type RolePiloteMilitaire = 'Pilote' | 'Co-pilote';

export type MissionStatus = 'en_attente' | 'valide' | 'echec' | null;

export type MissionDifficulty = 'facile' | 'moyen' | 'difficile' | 'expert';

export type ArmeeGradeId =
  | 'recrue'
  | 'soldat'
  | 'caporal'
  | 'sergent'
  | 'adjudant'
  | 'lieutenant'
  | 'capitaine'
  | 'commandant'
  | 'colonel';

export type ArmeeMission = {
  id: string;
  titre: string;
  description: string;
  rewardMin: number;
  rewardMax: number;
  /** Cooldown par utilisateur (minutes) après validation d'une mission. */
  cooldownMinutes: number;
  aeroport_depart: string;
  aeroport_arrivee: string;
  duree_minutes: number;
  escadrille_ou_escadron: EscadrilleOuEscadron;
  nature_vol_militaire: NatureVolMilitaire;
  callsign_prefix: string;
  difficulty: MissionDifficulty;
  /** Grade minimum requis pour lancer la mission. */
  minGrade: ArmeeGradeId;
};

/** Tags AAR autorisés pour les rapports après action. */
export const AAR_TAGS = [
  'objectif_atteint',
  'dommages',
  'incident',
  'extraction_reussie',
  'retard_meteo',
  'contact_ennemi',
  'sans_incident',
] as const;

export type AarTag = (typeof AAR_TAGS)[number];

export type CreateVolMilitaireInput = {
  armee_avion_id: string;
  mission_id?: string | null;
  escadrille_ou_escadron: EscadrilleOuEscadron;
  nature_vol_militaire?: NatureVolMilitaire | string | null;
  nature_vol_militaire_autre?: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  duree_minutes: number;
  depart_utc: string;
  commandant_bord: string;
  role_pilote?: RolePiloteMilitaire | string | null;
  pilote_id?: string | null;
  copilote_id?: string | null;
  equipage_ids?: string[] | null;
  callsign?: string | null;
  mission_aar_notes?: string | null;
  mission_aar_tags?: string[] | null;
};

export type UpdateVolMilitaireInput = {
  armee_avion_id?: string | null;
  escadrille_ou_escadron?: EscadrilleOuEscadron | string | null;
  nature_vol_militaire?: NatureVolMilitaire | string | null;
  nature_vol_militaire_autre?: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  duree_minutes: number;
  depart_utc: string;
  commandant_bord: string;
  callsign?: string | null;
  copilote_id?: string | null;
  chef_escadron_id?: string | null;
  equipage_ids?: string[] | null;
};

export type MissionCooldownInfo = {
  missionId: string;
  available: boolean;
  remainingMinutes: number;
  lastCompletedAt: string | null;
};

export type MissionRewardResult = {
  base: number;
  finalReward: number;
  delayMinutes: number;
  coeff: number;
};

export const MISSION_MAX_REFUSALS = 3;
export const TYPE_VOL_MILITAIRE = 'Vol militaire' as const;
