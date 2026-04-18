-- ============================================================
-- MIGRATION : Keflavik (IGRV → IKFL) + Pingeyri Airport (ITEY)
-- Date : 17 avril 2026
-- ============================================================
-- À exécuter dans l'éditeur SQL du projet Supabase (en une seule fois)
-- ============================================================

BEGIN;

-- ============================================================
-- 0) S'assurer que la contrainte de rôle profile inclut 'instructeur'
--    (Évite l'erreur lors d'autres migrations)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'pilote', 'instructeur', 'atc', 'siavi', 'ifsa'));
    RAISE NOTICE '✅ Contrainte profiles_role_check mise à jour';
  END IF;
END $$;

-- ============================================================
-- 1) Renommer le code OACI : IGRV → IKFL (Grindavik → Keflavik)
--    Toutes les tables qui référencent IGRV doivent être migrées
-- ============================================================

-- 1.a) SID/STAR
-- Supprimer d'abord les doublons IGRV qui ont déjà un équivalent IKFL
-- (cas d'une migration partielle précédente)
DELETE FROM public.sid_star a
  WHERE a.aeroport = 'IGRV'
    AND EXISTS (
      SELECT 1 FROM public.sid_star b
      WHERE b.aeroport = 'IKFL'
        AND b.type_procedure = a.type_procedure
        AND b.nom = a.nom
    );

-- Migrer le reste des IGRV vers IKFL
UPDATE public.sid_star
  SET aeroport = 'IKFL'
  WHERE aeroport = 'IGRV';

-- Renommer les SID GRINDAVIK 1/2 → KEFLAVIK 1/2 (si pas déjà fait)
-- Suppression préalable pour éviter conflit d'unicité
DELETE FROM public.sid_star
  WHERE aeroport = 'IKFL'
    AND type_procedure = 'SID'
    AND nom = 'GRINDAVIK 1'
    AND EXISTS (
      SELECT 1 FROM public.sid_star
      WHERE aeroport = 'IKFL' AND type_procedure = 'SID' AND nom = 'KEFLAVIK 1'
    );

DELETE FROM public.sid_star
  WHERE aeroport = 'IKFL'
    AND type_procedure = 'SID'
    AND nom = 'GRINDAVIK 2'
    AND EXISTS (
      SELECT 1 FROM public.sid_star
      WHERE aeroport = 'IKFL' AND type_procedure = 'SID' AND nom = 'KEFLAVIK 2'
    );

UPDATE public.sid_star
  SET nom = 'KEFLAVIK 1', route = 'gvk dct keflavik'
  WHERE aeroport = 'IKFL' AND type_procedure = 'SID' AND nom = 'GRINDAVIK 1';

UPDATE public.sid_star
  SET nom = 'KEFLAVIK 2'
  WHERE aeroport = 'IKFL' AND type_procedure = 'SID' AND nom = 'GRINDAVIK 2';

-- 1.b) Vols (départ + arrivée si colonnes présentes)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='vols' AND column_name='aeroport_depart') THEN
    UPDATE public.vols SET aeroport_depart = 'IKFL' WHERE aeroport_depart = 'IGRV';
    UPDATE public.vols SET aeroport_arrivee = 'IKFL' WHERE aeroport_arrivee = 'IGRV';
    RAISE NOTICE '✅ Vols : IGRV → IKFL';
  END IF;
END $$;

-- 1.c) Plans de vol
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='plans_vol' AND column_name='aeroport_depart') THEN
    UPDATE public.plans_vol SET aeroport_depart = 'IKFL' WHERE aeroport_depart = 'IGRV';
    UPDATE public.plans_vol SET aeroport_arrivee = 'IKFL' WHERE aeroport_arrivee = 'IGRV';
    RAISE NOTICE '✅ Plans de vol : IGRV → IKFL';
  END IF;
END $$;

-- 1.d) Vols ferry
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='vols_ferry') THEN
    UPDATE public.vols_ferry SET aeroport_depart = 'IKFL' WHERE aeroport_depart = 'IGRV';
    UPDATE public.vols_ferry SET aeroport_arrivee = 'IKFL' WHERE aeroport_arrivee = 'IGRV';
    RAISE NOTICE '✅ Vols ferry : IGRV → IKFL';
  END IF;
END $$;

-- 1.e) Pool passagers (PK = code_oaci)
DELETE FROM public.aeroport_passagers
  WHERE code_oaci = 'IGRV'
    AND EXISTS (SELECT 1 FROM public.aeroport_passagers WHERE code_oaci = 'IKFL');
UPDATE public.aeroport_passagers
  SET code_oaci = 'IKFL'
  WHERE code_oaci = 'IGRV';

-- 1.f) Pool cargo (PK = code_oaci)
DELETE FROM public.aeroport_cargo
  WHERE code_oaci = 'IGRV'
    AND EXISTS (SELECT 1 FROM public.aeroport_cargo WHERE code_oaci = 'IKFL');
UPDATE public.aeroport_cargo
  SET code_oaci = 'IKFL'
  WHERE code_oaci = 'IGRV';

-- 1.g) Fréquences VHF (UNIQUE sur aeroport+position)
DELETE FROM public.vhf_position_frequencies a
  WHERE a.aeroport = 'IGRV'
    AND EXISTS (
      SELECT 1 FROM public.vhf_position_frequencies b
      WHERE b.aeroport = 'IKFL' AND b.position = a.position
    );
UPDATE public.vhf_position_frequencies
  SET aeroport = 'IKFL'
  WHERE aeroport = 'IGRV';

-- 1.h) Hubs des compagnies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='compagnie_hubs') THEN
    UPDATE public.compagnie_hubs SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ Hubs : IGRV → IKFL';
  END IF;
END $$;

-- 1.i) Avions (aéroport actuel)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='compagnie_avions' AND column_name='aeroport_actuel') THEN
    UPDATE public.compagnie_avions SET aeroport_actuel = 'IKFL' WHERE aeroport_actuel = 'IGRV';
    RAISE NOTICE '✅ Avions compagnies : IGRV → IKFL';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='inventaire_avions' AND column_name='aeroport_actuel') THEN
    UPDATE public.inventaire_avions SET aeroport_actuel = 'IKFL' WHERE aeroport_actuel = 'IGRV';
    RAISE NOTICE '✅ Inventaire avions : IGRV → IKFL';
  END IF;
END $$;

-- 1.j) Tarifs liaisons
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tarifs_liaisons') THEN
    UPDATE public.tarifs_liaisons SET aeroport_depart = 'IKFL' WHERE aeroport_depart = 'IGRV';
    UPDATE public.tarifs_liaisons SET aeroport_arrivee = 'IKFL' WHERE aeroport_arrivee = 'IGRV';
    RAISE NOTICE '✅ Tarifs liaisons : IGRV → IKFL';
  END IF;
END $$;

-- 1.k) NOTAMs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='notams') THEN
    UPDATE public.notams SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ NOTAMs : IGRV → IKFL';
  END IF;
END $$;

-- 1.l) Sessions ATC
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='atc_sessions' AND column_name='aeroport') THEN
    UPDATE public.atc_sessions SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ Sessions ATC : IGRV → IKFL';
  END IF;
END $$;

-- 1.m) Sessions SIAVI
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='siavi_sessions' AND column_name='aeroport') THEN
    UPDATE public.siavi_sessions SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ Sessions SIAVI : IGRV → IKFL';
  END IF;
END $$;

-- ============================================================
-- 2) Ajout du nouvel aéroport ITEY (Pingeyri Airport)
-- ============================================================

-- 2.a) Pool passagers
INSERT INTO public.aeroport_passagers (code_oaci, passagers_disponibles, passagers_max)
VALUES ('ITEY', 1000, 1000)
ON CONFLICT (code_oaci) DO NOTHING;

-- 2.b) Pool cargo
INSERT INTO public.aeroport_cargo (code_oaci, cargo_disponible, cargo_max)
VALUES ('ITEY', 5000, 5000)
ON CONFLICT (code_oaci) DO NOTHING;

-- 2.c) Fréquences VHF
INSERT INTO public.vhf_position_frequencies (aeroport, position, frequency) VALUES
  ('ITEY', 'Tower',  '119.125'),
  ('ITEY', 'Ground', '121.375')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3) Vérification finale
-- ============================================================
DO $$
DECLARE
  v_remaining_igrv INTEGER := 0;
  v_itey_pax INTEGER;
  v_itey_cargo INTEGER;
  v_itey_freq INTEGER;
  v_keflavik_sids INTEGER;
BEGIN
  -- Compter les références IGRV restantes (devrait être 0)
  SELECT COUNT(*) INTO v_remaining_igrv FROM public.sid_star WHERE aeroport = 'IGRV';
  v_remaining_igrv := v_remaining_igrv + (SELECT COUNT(*) FROM public.aeroport_passagers WHERE code_oaci = 'IGRV');
  v_remaining_igrv := v_remaining_igrv + (SELECT COUNT(*) FROM public.aeroport_cargo WHERE code_oaci = 'IGRV');
  v_remaining_igrv := v_remaining_igrv + (SELECT COUNT(*) FROM public.vhf_position_frequencies WHERE aeroport = 'IGRV');

  -- Vérifier ITEY
  SELECT COUNT(*) INTO v_itey_pax FROM public.aeroport_passagers WHERE code_oaci = 'ITEY';
  SELECT COUNT(*) INTO v_itey_cargo FROM public.aeroport_cargo WHERE code_oaci = 'ITEY';
  SELECT COUNT(*) INTO v_itey_freq FROM public.vhf_position_frequencies WHERE aeroport = 'ITEY';

  -- Vérifier les SID Keflavik
  SELECT COUNT(*) INTO v_keflavik_sids FROM public.sid_star
    WHERE aeroport = 'IKFL' AND nom IN ('KEFLAVIK 1', 'KEFLAVIK 2');

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  RAPPORT DE MIGRATION';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  Références IGRV restantes : %', v_remaining_igrv;
  RAISE NOTICE '  ITEY passagers          : %', v_itey_pax;
  RAISE NOTICE '  ITEY cargo              : %', v_itey_cargo;
  RAISE NOTICE '  ITEY fréquences VHF     : %', v_itey_freq;
  RAISE NOTICE '  SID Keflavik 1/2        : %', v_keflavik_sids;
  RAISE NOTICE '════════════════════════════════════════';

  IF v_remaining_igrv > 0 THEN
    RAISE WARNING '⚠️  Il reste % références IGRV non migrées', v_remaining_igrv;
  ELSE
    RAISE NOTICE '✅ Migration IGRV → IKFL complète';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- FIN — Si tout est OK, le rapport ci-dessus indique 0 IGRV restant
--       et 1+ pour chaque ligne ITEY/Keflavik
-- ============================================================
