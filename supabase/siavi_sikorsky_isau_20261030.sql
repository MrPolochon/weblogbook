-- Sikorsky S-92 de la flotte MEDEVAC, stationné à ISAU (Sauthamptona).
-- Réexécutable : aucun second appareil si un Sikorsky est déjà à ISAU.
-- Le compte SIAVI n'est pas débité : ajout direct à la flotte.

BEGIN;

DO $$
DECLARE
  v_type uuid;
  v_prix numeric;
BEGIN
  SELECT id, prix INTO v_type, v_prix
  FROM public.types_avion
  WHERE nom = 'Sikorsky S-92' AND categorie = 'helicoptere'
  LIMIT 1;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Type Sikorsky S-92 introuvable dans types_avion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.siavi_avions
    WHERE type_avion_id = v_type AND aeroport_actuel = 'ISAU'
  ) THEN
    RAISE NOTICE 'Un Sikorsky S-92 est déjà stationné à ISAU';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.siavi_avions WHERE immatriculation = 'MED-ISAU')
     OR EXISTS (SELECT 1 FROM public.compagnie_avions WHERE immatriculation = 'MED-ISAU')
     OR EXISTS (SELECT 1 FROM public.inventaire_avions WHERE immatriculation = 'MED-ISAU') THEN
    RAISE EXCEPTION 'Immatriculation MED-ISAU déjà utilisée';
  END IF;

  INSERT INTO public.siavi_avions (
    type_avion_id, immatriculation, nom_personnalise,
    aeroport_actuel, statut, usure_percent, prix_achat
  ) VALUES (
    v_type, 'MED-ISAU', 'MEDEVAC ISAU',
    'ISAU', 'ground', 100, COALESCE(v_prix, 0)
  );
END $$;

COMMIT;
