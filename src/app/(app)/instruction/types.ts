export type ExamRequestMine = {
  id: string;
  requester_id: string;
  licence_code: string;
  instructeur_id: string | null;
  statut: string;
  message: string | null;
  response_note: string | null;
  resultat: string | null;
  dossier_conserve: boolean | null;
  licence_creee_id: string | null;
  created_at: string;
  updated_at: string;
  instructeur: { identifiant: string } | { identifiant: string }[] | null;
};

export type ExamRequestAssigned = {
  id: string;
  requester_id: string;
  licence_code: string;
  instructeur_id: string | null;
  statut: string;
  message: string | null;
  response_note: string | null;
  resultat: string | null;
  dossier_conserve: boolean | null;
  licence_creee_id: string | null;
  created_at: string;
  updated_at: string;
  requester: { identifiant: string } | { identifiant: string }[] | null;
  instructeur?: { identifiant: string } | { identifiant: string }[] | null;
};

/** Demandes ouvertes visibles par un admin (réassignation staff). */
export type ExamRequestStaffOpen = ExamRequestAssigned & {
  instructeur: { identifiant: string } | { identifiant: string }[] | null;
};

/** Ligne unifiée pour la vue admin (examens + trainings ouverts). */
export type AdminOpenDemande = {
  id: string;
  kind: 'exam' | 'pilot_training' | 'atc_training';
  requester_id: string;
  requester_identifiant: string;
  requester_photo_url?: string | null;
  licence_code: string;
  statut: string | null;
  assignee_id: string | null;
  assignee_identifiant: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
  /** Examens assigne/accepte uniquement — réassignation staff possible. */
  reassignable: boolean;
};

export type { AdminStaffReassignPools, AdminExamTrainerConflicts } from '@/lib/instruction-admin-staff-pools';

export type Eleve = {
  id: string;
  identifiant: string;
  formation_instruction_active: boolean;
  formation_instruction_licence: string | null;
  created_at: string;
  photoUrl?: string | null;
};

export type TypeAvion = {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
};

export type AvionTemp = {
  id: string;
  proprietaire_id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  immatriculation: string | null;
  aeroport_actuel: string | null;
  statut: string | null;
  usure_percent: number | null;
  instruction_actif: boolean;
  instruction_lifecycle?: string | null;
  instruction_session_kind?: string | null;
  instruction_session_id?: string | null;
};

export type ExamFinishDialog = {
  requestId: string;
  requesterName: string;
  licenceCode: string;
  step: 'choose_result' | 'form_reussi' | 'form_echoue';
};

export type ActiveInstructionSession = {
  kind: 'exam' | 'pilot_training';
  id: string;
  licence_code: string;
  counterpart_id: string;
  counterpart_identifiant: string | null;
  updated_at: string;
};
