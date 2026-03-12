-- ============================================================
-- Colonnes heure_depart/heure_arrivee pour plans_vol (IFSA, stats)
-- Sans ces colonnes, la sauvegarde de strip_atd peut échouer.
-- ============================================================

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS heure_depart_estimee TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heure_depart_reelle TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heure_arrivee_estimee TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heure_arrivee_reelle TIMESTAMPTZ;

COMMENT ON COLUMN public.plans_vol.heure_depart_reelle IS 'Heure réelle de départ (dérivée de strip_atd ou saisie)';
COMMENT ON COLUMN public.plans_vol.heure_arrivee_reelle IS 'Heure réelle d''arrivée à la clôture';
