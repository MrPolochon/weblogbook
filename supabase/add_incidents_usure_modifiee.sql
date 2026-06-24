-- Décision incident : usure modifiée à la baisse (valeur personnalisée ou 0%)

ALTER TABLE public.incidents_vol
  ADD COLUMN IF NOT EXISTS usure_apres_decision INTEGER;

COMMENT ON COLUMN public.incidents_vol.usure_apres_decision IS
  'Usure appliquée sur l''avion lors de la décision usure_modifiee.';

ALTER TABLE public.incidents_vol
  DROP CONSTRAINT IF EXISTS incidents_vol_decision_check;

ALTER TABLE public.incidents_vol
  ADD CONSTRAINT incidents_vol_decision_check
    CHECK (decision IN ('remis_en_etat', 'detruit', 'aucune_action', 'usure_modifiee'));
