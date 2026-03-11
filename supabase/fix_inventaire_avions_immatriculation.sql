-- Attribuer une immatriculation aux avions de l'inventaire personnel qui n'en ont pas
-- À exécuter manuellement si des avions personnels n'ont pas d'immatriculation

DO $$
DECLARE
  r RECORD;
  v_immat TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'generer_immatriculation') THEN
    RAISE NOTICE 'Fonction generer_immatriculation introuvable. Exécutez d''abord migration_flotte_individuelle.sql';
    RETURN;
  END IF;

  FOR r IN SELECT id FROM public.inventaire_avions WHERE immatriculation IS NULL OR TRIM(immatriculation) = ''
  LOOP
    v_immat := public.generer_immatriculation('F-');
    UPDATE public.inventaire_avions SET immatriculation = v_immat WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'Immatriculations attribuées aux avions personnels sans immat.';
END $$;
