-- Chrono limite pour les formulaires AeroSchool
-- Admins peuvent définir time_limit_minutes (NULL = pas de limite).
-- Si le temps est dépassé, la réponse est enregistrée avec status = 'time_expired'.

ALTER TABLE aeroschool_forms
  ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER DEFAULT NULL
  CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0);

-- Autoriser le status 'time_expired' pour les réponses
ALTER TABLE aeroschool_responses
  DROP CONSTRAINT IF EXISTS aeroschool_responses_status_check;

ALTER TABLE aeroschool_responses
  ADD CONSTRAINT aeroschool_responses_status_check
  CHECK (status IN ('submitted', 'trashed', 'time_expired'));
