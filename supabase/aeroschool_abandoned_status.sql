-- Statut "abandoned" pour les sessions AeroSchool quittées en cours
-- (utilisateur ferme l'onglet/navigateur en plein test, signal envoyé via navigator.sendBeacon).
-- Distinct de "trashed" (triche confirmée) et de "time_expired" (chrono écoulé).
-- 'reviewed' est aussi inclus car déjà utilisé par l'admin pour marquer une réponse examinée.

ALTER TABLE aeroschool_responses
  DROP CONSTRAINT IF EXISTS aeroschool_responses_status_check;

ALTER TABLE aeroschool_responses
  ADD CONSTRAINT aeroschool_responses_status_check
  CHECK (status IN ('submitted', 'trashed', 'time_expired', 'reviewed', 'abandoned'));
