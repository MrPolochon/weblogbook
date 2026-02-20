-- ============================================================
-- Correction : vente / don / prêt d'avions entre TOUS les membres
-- (pas seulement entre dirigeants). À exécuter si vous aviez déjà
-- appliqué add_alliances.sql avec l'ancienne version.
-- ============================================================

-- Renommer la colonne si elle existe encore sous l'ancien nom
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'alliance_parametres'
    AND column_name = 'actif_vente_avions_entre_dirigeants'
  ) THEN
    ALTER TABLE public.alliance_parametres
      RENAME COLUMN actif_vente_avions_entre_dirigeants TO actif_vente_avions_entre_membres;
  END IF;
END $$;

-- Remplacer la politique INSERT : tout membre de l'alliance peut initier un transfert
DROP POLICY IF EXISTS "alliance_transferts_insert_dirigeant" ON public.alliance_transferts_avions;
DROP POLICY IF EXISTS "alliance_transferts_insert_membre" ON public.alliance_transferts_avions;
CREATE POLICY "alliance_transferts_insert_membre" ON public.alliance_transferts_avions FOR INSERT TO authenticated
  WITH CHECK (from_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id = from_compagnie_id));

COMMENT ON TABLE public.alliance_transferts_avions IS 'Vente / don / prêt d''avion entre tous les membres de l''alliance.';
