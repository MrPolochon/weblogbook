-- Plans de vol : liaison mission / appareil Armée (ATC, table plans_vol)
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS armee_avion_id UUID REFERENCES public.armee_avions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS armee_mission_id TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_vol_armee_avion
  ON public.plans_vol(armee_avion_id)
  WHERE armee_avion_id IS NOT NULL;

COMMENT ON COLUMN public.plans_vol.armee_avion_id IS 'Appareil Armée (inventaire armée) pour plans militaires';
COMMENT ON COLUMN public.plans_vol.armee_mission_id IS 'Identifiant mission Armée (ARME_MISSIONS) si le plan est lié à une mission';
