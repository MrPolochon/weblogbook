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

-- 1.h) Hubs des compagnies (colonne réelle = aeroport_code)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='compagnie_hubs' AND column_name='aeroport_code') THEN
    UPDATE public.compagnie_hubs SET aeroport_code = 'IKFL' WHERE aeroport_code = 'IGRV';
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

-- 1.k) NOTAMs (colonne réelle = code_aeroport)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='notams' AND column_name='code_aeroport') THEN
    UPDATE public.notams SET code_aeroport = 'IKFL' WHERE code_aeroport = 'IGRV';
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

-- 1.n) Plans de vol : transferts en attente + holder ATC
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='plans_vol' AND column_name='pending_transfer_aeroport') THEN
    UPDATE public.plans_vol SET pending_transfer_aeroport = 'IKFL' WHERE pending_transfer_aeroport = 'IGRV';
    RAISE NOTICE '✅ Plans vol pending_transfer_aeroport : IGRV → IKFL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='plans_vol' AND column_name='current_holder_aeroport') THEN
    UPDATE public.plans_vol SET current_holder_aeroport = 'IKFL' WHERE current_holder_aeroport = 'IGRV';
    RAISE NOTICE '✅ Plans vol current_holder_aeroport : IGRV → IKFL';
  END IF;
END $$;

-- 1.o) Taxes ATC en attente
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='atc_taxes_pending' AND column_name='aeroport') THEN
    UPDATE public.atc_taxes_pending SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ atc_taxes_pending : IGRV → IKFL';
  END IF;
END $$;

-- 1.p) Plans contrôlés par les ATC
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='atc_plans_controles' AND column_name='aeroport') THEN
    -- UNIQUE(plan_vol_id, user_id, aeroport, position) : supprimer doublons potentiels
    DELETE FROM public.atc_plans_controles a
      WHERE a.aeroport = 'IGRV'
        AND EXISTS (
          SELECT 1 FROM public.atc_plans_controles b
          WHERE b.aeroport = 'IKFL'
            AND b.plan_vol_id = a.plan_vol_id
            AND b.user_id = a.user_id
            AND b.position = a.position
        );
    UPDATE public.atc_plans_controles SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ atc_plans_controles : IGRV → IKFL';
  END IF;
END $$;

-- 1.q) Incidents de vol (3 colonnes)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='incidents_vol' AND column_name='aeroport_depart') THEN
    UPDATE public.incidents_vol SET aeroport_depart = 'IKFL' WHERE aeroport_depart = 'IGRV';
    UPDATE public.incidents_vol SET aeroport_arrivee = 'IKFL' WHERE aeroport_arrivee = 'IGRV';
    UPDATE public.incidents_vol SET aeroport_incident = 'IKFL' WHERE aeroport_incident = 'IGRV';
    RAISE NOTICE '✅ incidents_vol (depart/arrivee/incident) : IGRV → IKFL';
  END IF;
END $$;

-- 1.r) ATIS Broadcast state (un seul broadcast actif à la fois)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='atis_broadcast_state' AND column_name='aeroport') THEN
    UPDATE public.atis_broadcast_state SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ atis_broadcast_state : IGRV → IKFL';
  END IF;
END $$;

-- 1.s) AFIS sessions (SIAVI)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='afis_sessions' AND column_name='aeroport') THEN
    UPDATE public.afis_sessions SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ afis_sessions : IGRV → IKFL';
  END IF;
END $$;

-- 1.t) Interventions SIAVI (urgences 911/112)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='siavi_interventions' AND column_name='aeroport') THEN
    UPDATE public.siavi_interventions SET aeroport = 'IKFL' WHERE aeroport = 'IGRV';
    RAISE NOTICE '✅ siavi_interventions : IGRV → IKFL';
  END IF;
END $$;

-- 1.u) Taxes aéroportuaires (PK = code_oaci)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='taxes_aeroport' AND column_name='code_oaci') THEN
    DELETE FROM public.taxes_aeroport
      WHERE code_oaci = 'IGRV'
        AND EXISTS (SELECT 1 FROM public.taxes_aeroport WHERE code_oaci = 'IKFL');
    UPDATE public.taxes_aeroport SET code_oaci = 'IKFL' WHERE code_oaci = 'IGRV';
    RAISE NOTICE '✅ taxes_aeroport : IGRV → IKFL';
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

COMMIT;

-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
-- Si vous voyez tous les "✅ ... : IGRV → IKFL" ci-dessus dans l'onglet
-- Notices/Messages et AUCUN message d'erreur rouge, alors la migration
-- a réussi.
--
-- Pour vérifier qu'il ne reste vraiment plus aucune référence à IGRV,
-- exécutez (dans une AUTRE requête SQL, pas dans le même run que cette
-- migration) le fichier supabase/VERIF_KEFLAVIK_PINGEYRI.sql.
-- ============================================================
