-- Rôle instructeur Discord (tickets CAT / instruction / AeroSchool)

ALTER TABLE public.support_bot_config
  ADD COLUMN IF NOT EXISTS instructor_role_id TEXT,
  ADD COLUMN IF NOT EXISTS instructor_motifs JSONB NOT NULL DEFAULT '["cat1","cat2","cat3","cat4","cat5","instruction","aeroschool"]'::jsonb;

COMMENT ON COLUMN public.support_bot_config.instructor_role_id IS 'Rôle Discord instructeur (CAT / instruction), configurable sur le site.';
COMMENT ON COLUMN public.support_bot_config.instructor_motifs IS 'Motifs pour lesquels le rôle instructeur a accès au salon et est pingé.';
