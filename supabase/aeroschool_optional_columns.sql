-- Colonnes optionnelles AeroSchool (time limit + antitriche)
-- Exécuter si l'erreur "Could not find 'time_limit_minutes' column" apparaît à la création de formulaire.
-- Sans ce script, la création fonctionne mais ces options ne sont pas disponibles.

-- Limite de temps (minutes) pour le formulaire ; NULL = pas de limite
ALTER TABLE public.aeroschool_forms
  ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER DEFAULT NULL;

ALTER TABLE public.aeroschool_forms
  DROP CONSTRAINT IF EXISTS aeroschool_forms_time_limit_minutes_check;

ALTER TABLE public.aeroschool_forms
  ADD CONSTRAINT aeroschool_forms_time_limit_minutes_check
  CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0);

-- Option antitriche par formulaire
ALTER TABLE public.aeroschool_forms
  ADD COLUMN IF NOT EXISTS antitriche_enabled BOOLEAN NOT NULL DEFAULT true;
