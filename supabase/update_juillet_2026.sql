-- =============================================================================
-- MIGRATION JUILLET 2026 — Réforme licences, salaire ATC, mode indisponible
-- =============================================================================
-- À exécuter manuellement dans Supabase SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Suppression des licences obsolètes de la table licences_qualifications
--    Licences concernées : PPL, CPL, ATPL, IR ME, Multi Crew attestation,
--    CLASS-M, CLASS-MT, CLASS-MRP, IFR, VFR, COM 1-6.
-- -----------------------------------------------------------------------------

DELETE FROM public.licences_qualifications
WHERE type IN (
  'PPL',
  'CPL',
  'ATPL',
  'IR ME',
  'Multi Crew attestation',
  'CLASS-M',
  'CLASS-MT',
  'CLASS-MRP',
  'IFR',
  'VFR',
  'IFR',
  'VFR'
);

-- -----------------------------------------------------------------------------
-- 2. Réinitialiser les formations instruction actives dont la licence est
--    désormais supprimée (les élèves en formation PPL/CPL/ATPL/IR ME).
--    Leur formation est fermée et le référent effacé.
-- -----------------------------------------------------------------------------

UPDATE public.profiles
SET
  formation_instruction_active = false,
  formation_instruction_licence = NULL,
  instructeur_referent_id = NULL
WHERE formation_instruction_active = true
  AND formation_instruction_licence IN ('PPL', 'CPL', 'ATPL', 'IR ME');

-- Supprimer les items de progression liés aux parcours supprimés
DELETE FROM public.instruction_progression_items
WHERE licence_code IN ('PPL', 'CPL', 'ATPL', 'IR ME');

-- Archiver (supprimer) les demandes d'examens en attente pour ces licences
DELETE FROM public.instruction_exam_requests
WHERE statut IN ('assigne', 'accepte', 'en_cours')
  AND licence_code IN (
    'PPL', 'CPL', 'ATPL', 'IR ME',
    'Multi Crew attestation',
    'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
    'IFR', 'VFR',
    'IFR', 'VFR'
  );

-- Annuler les demandes de training pilote en cours
-- (les trainings pilotes n'ont plus de programmes actifs hors ATC-INIT)
-- Note : on garde les historiques, on annule seulement les demandes ouvertes
-- sans instructeur attribué ou non répondues.

-- -----------------------------------------------------------------------------
-- 3. Ajout de la colonne instruction_indisponible sur profiles
--    (mode indisponible FI / FE / ATC FI / ATC FE)
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instruction_indisponible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.instruction_indisponible IS
  'Instructeur / examinateur marqué indisponible : ne reçoit plus de nouvelles demandes de training ou d''examen. Ses élèves actifs sont transférés automatiquement.';

-- Index pour filtrer efficacement les disponibles
CREATE INDEX IF NOT EXISTS idx_profiles_instruction_indisponible
  ON public.profiles (instruction_indisponible)
  WHERE instruction_indisponible = true;

-- -----------------------------------------------------------------------------
-- 4. Fin de migration
-- -----------------------------------------------------------------------------
-- Rappel : le type de chèque 'cheque_salaire_atc' peut nécessiter d'être
-- ajouté à l'enum messages.type_message si celle-ci existe en base.
-- Vérifier avec :
--   SELECT unnest(enum_range(NULL::messages_type_message_enum));
-- et ajouter si nécessaire :
--   ALTER TYPE messages_type_message_enum ADD VALUE IF NOT EXISTS 'cheque_salaire_atc';
-- =============================================================================
