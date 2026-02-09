-- Ajout des licences CAT 1 et CAT 2
-- CAT 1 : Avions monomoteur VFR
-- CAT 2 : Hélicoptères
-- Exécuter dans l'éditeur SQL Supabase

-- Mettre à jour la contrainte pour inclure CAT 1 et CAT 2
ALTER TABLE public.licences_qualifications DROP CONSTRAINT IF EXISTS licences_qualifications_type_check;

ALTER TABLE public.licences_qualifications ADD CONSTRAINT licences_qualifications_type_check CHECK (type IN (
  'PPL', 'CPL', 'ATPL',
  'IR ME',
  'Qualification Type',
  'CAT 1', 'CAT 2', 'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
  'C1', 'C2', 'C3', 'C4', 'C6',
  'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
  'IFR', 'VFR',
  'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC'
));
