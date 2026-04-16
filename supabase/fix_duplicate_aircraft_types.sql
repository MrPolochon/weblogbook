-- Fusion des types d'avion en doublon.
-- Le schema.sql initial a créé des entrées avec des noms courts (A320, B737, etc.)
-- Le seed_avions_ptfs.sql a ensuite ajouté les mêmes avions avec des noms complets
-- (Airbus A320, Boeing 737, etc.) mais les anciennes entrées n'ont pas pu être
-- supprimées car elles avaient des FK references (vols, inventaire, etc.)
-- Ce script migre toutes les références puis supprime les doublons.

DO $$
DECLARE
  pair RECORD;
  old_id UUID;
  new_id UUID;
  cnt INT;
  total_merged INT := 0;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('A220',           'Airbus A220'),
      ('A320',           'Airbus A320'),
      ('A330',           'Airbus A330'),
      ('A340',           'Airbus A340'),
      ('A350',           'Airbus A350'),
      ('A380',           'Airbus A380'),
      ('B727',           'Boeing 727'),
      ('B737',           'Boeing 737'),
      ('B747',           'Boeing 747'),
      ('B757',           'Boeing 757'),
      ('B767',           'Boeing 767'),
      ('B777',           'Boeing 777'),
      ('B787',           'Boeing 787'),
      ('ATR72',          'ATR-72'),
      ('E190',           'Embraer E190'),
      ('AN-22',          'Antonov An-22'),
      ('AN-225',         'Antonov AN-225'),
      ('BelugaXL',       'Airbus BelugaXL'),
      ('Dreamlifter',    'Boeing DreamLifter'),
      ('CONCORDE',       'Concorde'),
      ('MD-11 Cargo',    'McDonnell Douglas MD-11 Cargo'),
      ('Cessna Caravane','Cessna Caravan'),
      ('DC10',           'McDonnell Douglas MD-11'),
      ('C-130 Cargo',    'C-130 Hercules')
    ) AS t(old_name, new_name)
  LOOP
    SELECT id INTO old_id FROM public.types_avion WHERE nom = pair.old_name;
    SELECT id INTO new_id FROM public.types_avion WHERE nom = pair.new_name;

    IF old_id IS NULL THEN
      RAISE NOTICE 'SKIP: "%" n''existe pas (deja supprime?)', pair.old_name;
      CONTINUE;
    END IF;

    IF new_id IS NULL THEN
      RAISE NOTICE 'SKIP: "%" n''existe pas — on renomme "%" directement', pair.new_name, pair.old_name;
      UPDATE public.types_avion SET nom = pair.new_name WHERE id = old_id;
      CONTINUE;
    END IF;

    IF old_id = new_id THEN
      CONTINUE;
    END IF;

    RAISE NOTICE 'MERGE: "%" -> "%"', pair.old_name, pair.new_name;

    -- Migrer les FK dans toutes les tables référençant type_avion_id
    UPDATE public.vols SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    IF cnt > 0 THEN RAISE NOTICE '  vols: % lignes', cnt; END IF;

    BEGIN UPDATE public.vols_archive SET type_avion_nom = pair.new_name WHERE type_avion_nom = pair.old_name;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  vols_archive: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;

    BEGIN UPDATE public.inventaire_avions SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  inventaire_avions: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      UPDATE public.compagnie_avions SET type_avion_id = new_id WHERE type_avion_id = old_id
        AND NOT EXISTS (SELECT 1 FROM public.compagnie_avions ca2 WHERE ca2.compagnie_id = compagnie_avions.compagnie_id AND ca2.type_avion_id = new_id);
      GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  compagnie_avions: % lignes', cnt; END IF;
      DELETE FROM public.compagnie_avions WHERE type_avion_id = old_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.compagnie_flotte SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  compagnie_flotte: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.licences_qualifications SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  licences_qualifications: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.armee_avions SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  armee_avions: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.reparation_tarifs SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  reparation_tarifs: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.hangar_market SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  hangar_market: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.hangar_market_reventes SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  hangar_market_reventes: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.plans_vol SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  plans_vol: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN UPDATE public.autorisations_exploitation SET type_avion_id = new_id WHERE type_avion_id = old_id;
    GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt > 0 THEN RAISE NOTICE '  autorisations_exploitation: % lignes', cnt; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    DELETE FROM public.types_avion WHERE id = old_id;
    total_merged := total_merged + 1;
    RAISE NOTICE '  -> Supprime "%"', pair.old_name;
  END LOOP;

  RAISE NOTICE '=== % doublons fusionnes ===', total_merged;
END $$;

-- B707 : fusionner si Boeing 707 existe déjà, sinon renommer
DO $$
DECLARE
  old_id UUID;
  new_id UUID;
BEGIN
  SELECT id INTO old_id FROM public.types_avion WHERE nom = 'B707';
  SELECT id INTO new_id FROM public.types_avion WHERE nom = 'Boeing 707';
  IF old_id IS NULL THEN RETURN; END IF;
  IF new_id IS NULL THEN
    UPDATE public.types_avion SET nom = 'Boeing 707', constructeur = 'Boeing' WHERE id = old_id;
    RAISE NOTICE 'Renomme B707 -> Boeing 707';
  ELSIF old_id <> new_id THEN
    UPDATE public.vols SET type_avion_id = new_id WHERE type_avion_id = old_id;
    BEGIN UPDATE public.vols_archive SET type_avion_nom = 'Boeing 707' WHERE type_avion_nom = 'B707'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.inventaire_avions SET type_avion_id = new_id WHERE type_avion_id = old_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.compagnie_avions WHERE type_avion_id = old_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN UPDATE public.licences_qualifications SET type_avion_id = new_id WHERE type_avion_id = old_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    DELETE FROM public.types_avion WHERE id = old_id;
    RAISE NOTICE 'Fusionne B707 -> Boeing 707';
  END IF;
END $$;
