-- ============================================================
-- FIX : Locations expirées encore marquées 'active'
-- Exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Correction immédiate : passer toutes les locations dont
--    end_at est dépassée de 'active' à 'terminee'
UPDATE public.compagnie_locations
SET statut = 'terminee'
WHERE statut = 'active'
  AND end_at IS NOT NULL
  AND end_at < NOW();

-- 2. Fonction appelable manuellement ou via pg_cron
CREATE OR REPLACE FUNCTION public.expire_locations_actives()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nb INTEGER;
BEGIN
  UPDATE public.compagnie_locations
  SET statut = 'terminee'
  WHERE statut = 'active'
    AND end_at IS NOT NULL
    AND end_at < NOW();

  GET DIAGNOSTICS nb = ROW_COUNT;
  RETURN nb;
END;
$$;

-- 3. (Optionnel) Activer pg_cron pour automatiser toutes les heures
--    Nécessite l'extension pg_cron (disponible sur Supabase Pro)
--    Décommenter si l'extension est activée :
--
-- SELECT cron.schedule(
--   'expire-locations-actives',   -- nom du job
--   '0 * * * *',                  -- toutes les heures, à la minute 0
--   $$ SELECT public.expire_locations_actives(); $$
-- );

-- Vérification
DO $$
DECLARE
  nb INTEGER;
BEGIN
  SELECT COUNT(*) INTO nb
  FROM public.compagnie_locations
  WHERE statut = 'active'
    AND end_at IS NOT NULL
    AND end_at < NOW();

  IF nb = 0 THEN
    RAISE NOTICE '✅ Aucune location expirée active restante.';
  ELSE
    RAISE WARNING '⚠️ % location(s) encore active(s) malgré end_at dépassé.', nb;
  END IF;
END $$;
