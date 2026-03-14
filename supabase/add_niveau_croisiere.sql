-- Niveau de croisière pour plans de vol IFR
-- Affiché dans la case intention du strip comme "CRZ : FL XXX"

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS niveau_croisiere TEXT;

COMMENT ON COLUMN public.plans_vol.niveau_croisiere IS 'Niveau de croisière demandé (ex: 350 pour FL350). Affiché dans intentions comme CRZ : FL XXX';
