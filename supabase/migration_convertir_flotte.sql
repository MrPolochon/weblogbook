-- ============================================================
-- MIGRATION: Convertir l'ancienne flotte vers avions individuels
-- Exécuter APRÈS migration_flotte_individuelle.sql
-- ============================================================

-- Cette migration lit compagnie_flotte et crée des avions individuels
-- dans compagnie_avions pour chaque quantité

DO $$
DECLARE
  flotte_record RECORD;
  i INTEGER;
  new_immat TEXT;
  hub_code TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  j INTEGER;
BEGIN
  -- Parcourir chaque entrée de l'ancienne flotte
  FOR flotte_record IN 
    SELECT 
      f.id,
      f.compagnie_id,
      f.type_avion_id,
      f.quantite,
      f.nom_personnalise,
      t.nom as type_nom
    FROM public.compagnie_flotte f
    JOIN public.types_avion t ON t.id = f.type_avion_id
  LOOP
    -- Trouver le hub principal de la compagnie
    SELECT aeroport_code INTO hub_code
    FROM public.compagnie_hubs
    WHERE compagnie_id = flotte_record.compagnie_id
      AND est_hub_principal = true
    LIMIT 1;
    
    -- Si pas de hub, utiliser IRFD par défaut
    IF hub_code IS NULL THEN
      hub_code := 'IRFD';
    END IF;
    
    -- Créer autant d'avions individuels que la quantité
    FOR i IN 1..flotte_record.quantite LOOP
      -- Générer une immatriculation unique
      LOOP
        new_immat := 'F-';
        FOR j IN 1..4 LOOP
          new_immat := new_immat || substr(chars, floor(random() * 26 + 1)::int, 1);
        END LOOP;
        
        -- Vérifier unicité
        IF NOT EXISTS (SELECT 1 FROM public.compagnie_avions WHERE immatriculation = new_immat) THEN
          EXIT;
        END IF;
      END LOOP;
      
      -- Insérer l'avion individuel
      INSERT INTO public.compagnie_avions (
        compagnie_id,
        type_avion_id,
        immatriculation,
        nom_bapteme,
        aeroport_actuel,
        usure_percent,
        statut
      ) VALUES (
        flotte_record.compagnie_id,
        flotte_record.type_avion_id,
        new_immat,
        CASE 
          WHEN flotte_record.quantite = 1 THEN flotte_record.nom_personnalise
          ELSE NULL
        END,
        hub_code,
        100,
        'ground'
      );
      
      RAISE NOTICE 'Créé avion % pour compagnie % (type: %)', new_immat, flotte_record.compagnie_id, flotte_record.type_nom;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Migration terminée !';
END $$;

-- Afficher le résultat
SELECT 
  c.nom as compagnie,
  COUNT(*) as nb_avions
FROM public.compagnie_avions a
JOIN public.compagnies c ON c.id = a.compagnie_id
GROUP BY c.nom
ORDER BY c.nom;
