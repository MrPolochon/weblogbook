-- Ajouter CAT 6 et C1-C6 aux licences
-- Exécuter dans l'éditeur SQL Supabase si la table existe déjà

-- Supprimer l'ancienne contrainte
ALTER TABLE public.licences_qualifications DROP CONSTRAINT IF EXISTS licences_qualifications_type_check;

-- Recréer la contrainte avec les nouveaux types
ALTER TABLE public.licences_qualifications ADD CONSTRAINT licences_qualifications_type_check
  CHECK (type IN (
    'PPL', 'CPL', 'ATPL',
    'IR ME',
    'Qualification Type',
    'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
    'C1', 'C2', 'C3', 'C4', 'C6',
    'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
    'IFR', 'VFR',
    'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
    'CAL-ATC', 'CAL-AFIS',
    'PCAL-ATC', 'PCAL-AFIS',
    'LPAFIS', 'LATC'
  ));
