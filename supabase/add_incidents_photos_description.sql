-- ============================================================
-- Incidents de vol : description pilote + photos + décision "aucune_action"
-- ============================================================

-- Description libre de l'ATC au moment du signalement
ALTER TABLE public.incidents_vol
  ADD COLUMN IF NOT EXISTS description TEXT;

-- URLs des photos uploadées dans le bucket cartes-identite/incidents/
ALTER TABLE public.incidents_vol
  ADD COLUMN IF NOT EXISTS images_urls TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.incidents_vol.description IS
  'Description libre saisie par l''ATC au moment du signalement de l''incident.';

COMMENT ON COLUMN public.incidents_vol.images_urls IS
  'URLs publiques des photos uploadées dans cartes-identite/incidents/{id}/. '
  'Supprimées automatiquement à la clôture de l''incident.';

-- Ajouter "aucune_action" comme décision valide :
-- l'avion reste dans son état actuel (usure inchangée), juste débloqué.
-- On doit recréer la contrainte CHECK qui n'acceptait que remis_en_etat | detruit.
ALTER TABLE public.incidents_vol
  DROP CONSTRAINT IF EXISTS incidents_vol_decision_check;

ALTER TABLE public.incidents_vol
  ADD CONSTRAINT incidents_vol_decision_check
    CHECK (decision IN ('remis_en_etat', 'detruit', 'aucune_action'));
