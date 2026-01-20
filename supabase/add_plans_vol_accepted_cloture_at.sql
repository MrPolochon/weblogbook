-- accepted_at : heure d'acceptation du plan par un ATC (pour pré-remplissage du vol)
-- cloture_at  : heure de clôture du plan (durée = cloture_at - accepted_at)
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloture_at TIMESTAMPTZ;
