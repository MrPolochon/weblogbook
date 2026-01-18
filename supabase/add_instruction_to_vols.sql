-- Type de vol Instruction + instructeur et type d'instruction
-- Exécuter dans l'éditeur SQL Supabase

-- Étendre type_vol (IFR, VFR, Instruction)
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction'));

-- Instructeur (admin) et type d'instruction (libre)
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instruction_type TEXT;
