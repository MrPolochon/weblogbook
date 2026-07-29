-- =============================================================================
-- Purge licences legacy juillet 2026 (correction : CONSERVER VFR, IFR, COM 1–6)
-- =============================================================================
-- Programmes supprimés : PPL, CPL, ATPL, IR ME, Multi Crew, CLASS-M*
-- Conservés : VFR, IFR, COM 1–6, CAT, FI/FE/ATC FI/ATC FE, LATC, CAL-*, etc.
-- =============================================================================

-- 1. Supprimer les qualifications legacy encore en base (historique non critique)
DELETE FROM public.licences_qualifications
WHERE type IN (
  'PPL',
  'CPL',
  'ATPL',
  'IR ME',
  'Multi Crew attestation',
  'CLASS-M',
  'CLASS-MT',
  'CLASS-MRP'
);

-- 2. Fermer les formations instruction sur parcours supprimés
UPDATE public.profiles
SET
  formation_instruction_active = false,
  formation_instruction_licence = NULL,
  instructeur_referent_id = NULL
WHERE formation_instruction_active = true
  AND formation_instruction_licence IN ('PPL', 'CPL', 'ATPL', 'IR ME');

UPDATE public.profiles
SET formation_instruction_licence = NULL
WHERE formation_instruction_active = false
  AND formation_instruction_licence IN ('PPL', 'CPL', 'ATPL', 'IR ME');

-- 3. Progression / examens en attente pour licences supprimées
DELETE FROM public.instruction_progression_items
WHERE licence_code IN ('PPL', 'CPL', 'ATPL', 'IR ME');

DELETE FROM public.instruction_exam_requests
WHERE statut IN ('assigne', 'accepte', 'en_cours')
  AND licence_code IN (
    'PPL', 'CPL', 'ATPL', 'IR ME',
    'Multi Crew attestation',
    'CLASS-M', 'CLASS-MT', 'CLASS-MRP'
  );

-- 4. Contrainte CHECK : catalogue actif uniquement (VFR/IFR/COM conservés)
ALTER TABLE public.licences_qualifications DROP CONSTRAINT IF EXISTS licences_qualifications_type_check;

ALTER TABLE public.licences_qualifications ADD CONSTRAINT licences_qualifications_type_check CHECK (type IN (
  'FI', 'FE', 'ATC FI', 'ATC FE',
  'Qualification Type',
  'VFR', 'IFR',
  'CAT 1', 'CAT 2', 'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
  'C1', 'C2', 'C3', 'C4', 'C6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC',
  'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6'
));

COMMENT ON COLUMN public.licences_qualifications.langue IS
  'Langue de validité pour les licences COM 1–6 (ex. Français, Anglais). Obligatoire pour les types COM.';
