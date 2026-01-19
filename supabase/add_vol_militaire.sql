-- Vol militaire : type, avion liste fixe, escadrille/escadron, nature
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction', 'Vol militaire'));

-- type_avion_id nullable pour Vol militaire (on utilise type_avion_militaire)
ALTER TABLE public.vols ALTER COLUMN type_avion_id DROP NOT NULL;

ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS type_avion_militaire TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS escadrille_ou_escadron TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS chef_escadron_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS nature_vol_militaire TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS nature_vol_militaire_autre TEXT;
