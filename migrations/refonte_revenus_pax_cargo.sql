-- =====================================================
-- REFONTE REVENUS PAX/CARGO
-- =====================================================
-- Crée la table unifiée `aeroports` qui devient la source de vérité dynamique :
--   - passagers_disponibles, passagers_max, derniere_regeneration_pax
--   - cargo_disponible,    cargo_max,     derniere_regeneration_cargo
--   - last_flight_arrival (NOUVEAU : pour le bonus d'isolement)
--
-- Migre les données depuis aeroport_passagers et aeroport_cargo, puis remplace
-- ces tables par des VUES de compatibilité afin de ne casser aucune route API
-- existante pendant la transition.
--
-- Recrée toutes les RPC (regenerer_*, consommer_*, livrer_cargo) sur la nouvelle
-- table et ajoute la nouvelle RPC `enregistrer_arrivee_vol`.
-- =====================================================

BEGIN;

-- =====================================================
-- 1) Table unifiée
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aeroports (
  code_oaci TEXT PRIMARY KEY,
  passagers_disponibles INTEGER NOT NULL DEFAULT 5000,
  passagers_max INTEGER NOT NULL DEFAULT 5000,
  derniere_regeneration_pax TIMESTAMPTZ NOT NULL DEFAULT now(),
  cargo_disponible INTEGER NOT NULL DEFAULT 0,
  cargo_max INTEGER NOT NULL DEFAULT 0,
  derniere_regeneration_cargo TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_flight_arrival TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aeroports_code ON public.aeroports(code_oaci);

ALTER TABLE public.aeroports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aeroports_select" ON public.aeroports;
CREATE POLICY "aeroports_select" ON public.aeroports
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "aeroports_update" ON public.aeroports;
CREATE POLICY "aeroports_update" ON public.aeroports
  FOR UPDATE TO service_role USING (true);

DROP POLICY IF EXISTS "aeroports_insert" ON public.aeroports;
CREATE POLICY "aeroports_insert" ON public.aeroports
  FOR INSERT TO service_role WITH CHECK (true);

-- =====================================================
-- 2) Backfill : aeroport_passagers + aeroport_cargo -> aeroports
--    (on tolère que les tables existantes soient encore présentes ou non)
-- =====================================================
DO $migrate$
DECLARE
  has_pax  BOOLEAN;
  has_carg BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'aeroport_passagers' AND c.relkind = 'r'
  ) INTO has_pax;

  SELECT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'aeroport_cargo' AND c.relkind = 'r'
  ) INTO has_carg;

  IF has_pax THEN
    INSERT INTO public.aeroports (
      code_oaci, passagers_disponibles, passagers_max,
      derniere_regeneration_pax, last_flight_arrival, updated_at
    )
    SELECT
      code_oaci,
      passagers_disponibles,
      passagers_max,
      COALESCE(derniere_regeneration, now()),
      now(),
      now()
    FROM public.aeroport_passagers
    ON CONFLICT (code_oaci) DO UPDATE SET
      passagers_disponibles = EXCLUDED.passagers_disponibles,
      passagers_max = EXCLUDED.passagers_max,
      derniere_regeneration_pax = EXCLUDED.derniere_regeneration_pax,
      updated_at = now();
  END IF;

  IF has_carg THEN
    INSERT INTO public.aeroports (
      code_oaci, cargo_disponible, cargo_max,
      derniere_regeneration_cargo, last_flight_arrival, updated_at
    )
    SELECT
      code_oaci,
      cargo_disponible,
      cargo_max,
      COALESCE(derniere_regeneration, now()),
      now(),
      now()
    FROM public.aeroport_cargo
    ON CONFLICT (code_oaci) DO UPDATE SET
      cargo_disponible = EXCLUDED.cargo_disponible,
      cargo_max = EXCLUDED.cargo_max,
      derniere_regeneration_cargo = EXCLUDED.derniere_regeneration_cargo,
      updated_at = now();
  END IF;
END;
$migrate$ LANGUAGE plpgsql;

-- =====================================================
-- 3) Drop des anciennes tables et création de vues compatibles
--    Les anciennes routes API continuent de fonctionner sans modification.
-- =====================================================
DROP TABLE IF EXISTS public.aeroport_passagers CASCADE;
DROP TABLE IF EXISTS public.aeroport_cargo CASCADE;

CREATE OR REPLACE VIEW public.aeroport_passagers AS
SELECT
  code_oaci,
  passagers_disponibles,
  passagers_max,
  derniere_regeneration_pax AS derniere_regeneration,
  updated_at
FROM public.aeroports;

CREATE OR REPLACE VIEW public.aeroport_cargo AS
SELECT
  code_oaci,
  cargo_disponible,
  cargo_max,
  derniere_regeneration_cargo AS derniere_regeneration
FROM public.aeroports;

GRANT SELECT ON public.aeroport_passagers TO authenticated;
GRANT SELECT ON public.aeroport_cargo TO authenticated;

-- =====================================================
-- 4) RPC : régénération PAX (15 % par 30 min, plafonné au max)
-- =====================================================
CREATE OR REPLACE FUNCTION public.regenerer_passagers_aeroport()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.aeroports
  SET
    passagers_disponibles = LEAST(
      passagers_max,
      passagers_disponibles + GREATEST(
        1,
        FLOOR(passagers_max * 0.10 * EXTRACT(EPOCH FROM (now() - derniere_regeneration_pax)) / 3600)
      )::INTEGER
    ),
    derniere_regeneration_pax = now(),
    updated_at = now()
  WHERE EXTRACT(EPOCH FROM (now() - derniere_regeneration_pax)) >= 300;
END;
$$;

-- =====================================================
-- 5) RPC : régénération CARGO (15 % par 30 min)
-- =====================================================
CREATE OR REPLACE FUNCTION public.regenerer_cargo_aeroport()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  regen_interval INTERVAL := '30 minutes';
  regen_rate NUMERIC := 0.15;
BEGIN
  UPDATE public.aeroports
  SET
    cargo_disponible = LEAST(
      cargo_max,
      cargo_disponible + CEIL(cargo_max * regen_rate)::INTEGER
    ),
    derniere_regeneration_cargo = now(),
    updated_at = now()
  WHERE derniere_regeneration_cargo < now() - regen_interval;
END;
$$;

-- =====================================================
-- 6) RPC : consommation PAX
-- =====================================================
CREATE OR REPLACE FUNCTION public.consommer_passagers_aeroport(p_code_oaci TEXT, p_passagers INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.aeroports
  SET
    passagers_disponibles = GREATEST(0, passagers_disponibles - p_passagers),
    updated_at = now()
  WHERE code_oaci = p_code_oaci;
END;
$$;

-- =====================================================
-- 7) RPC : consommation CARGO
-- =====================================================
CREATE OR REPLACE FUNCTION public.consommer_cargo(p_code_oaci TEXT, p_quantite INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispo INTEGER;
BEGIN
  SELECT cargo_disponible INTO v_dispo FROM public.aeroports WHERE code_oaci = p_code_oaci;
  IF v_dispo IS NULL OR v_dispo < p_quantite THEN
    RETURN FALSE;
  END IF;
  UPDATE public.aeroports
  SET cargo_disponible = cargo_disponible - p_quantite,
      updated_at = now()
  WHERE code_oaci = p_code_oaci;
  RETURN TRUE;
END;
$$;

-- =====================================================
-- 8) RPC : livraison CARGO (autorise dépassement temporaire à 120 % du max)
-- =====================================================
CREATE OR REPLACE FUNCTION public.livrer_cargo(p_code_oaci TEXT, p_quantite INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.aeroports
  SET
    cargo_disponible = LEAST(
      (cargo_max * 1.2)::INTEGER,
      cargo_disponible + p_quantite
    ),
    updated_at = now()
  WHERE code_oaci = p_code_oaci;
  RETURN TRUE;
END;
$$;

-- =====================================================
-- 9) RPC : enregistrement de l'arrivée d'un vol (pour le bonus d'isolement)
-- =====================================================
CREATE OR REPLACE FUNCTION public.enregistrer_arrivee_vol(p_code_oaci TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.aeroports
  SET last_flight_arrival = now(),
      updated_at = now()
  WHERE code_oaci = p_code_oaci;
END;
$$;

-- =====================================================
-- 10) Permissions sur les RPC
-- =====================================================
DO $perms$
DECLARE
  fn TEXT;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'public.regenerer_passagers_aeroport()',
      'public.regenerer_cargo_aeroport()',
      'public.consommer_passagers_aeroport(text, integer)',
      'public.consommer_cargo(text, integer)',
      'public.livrer_cargo(text, integer)',
      'public.enregistrer_arrivee_vol(text)'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    BEGIN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn); EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn); EXCEPTION WHEN undefined_object THEN NULL; END;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$perms$;

-- =====================================================
-- 11) Initialisation des aéroports manquants (depuis la liste statique PTFS)
--     Si un aéroport est référencé dans aeroports-ptfs.ts mais pas encore en
--     base, on l'insère avec ses capacités max par défaut.
-- =====================================================
INSERT INTO public.aeroports (code_oaci, passagers_disponibles, passagers_max, cargo_disponible, cargo_max)
VALUES
  -- Internationaux
  ('ITKO', 25000, 25000, 150000, 150000),
  ('IPPH', 18000, 18000, 120000, 120000),
  ('ILAR', 15000, 15000, 80000, 80000),
  ('IPAP', 12000, 12000, 50000, 50000),
  ('IRFD', 12000, 12000, 200000, 200000),
  ('IMLR', 15000, 15000, 180000, 180000),
  ('IZOL', 10000, 10000, 100000, 100000),
  -- Régionaux
  ('ISAU', 8000, 8000, 60000, 60000),
  ('IJAF', 5000, 5000, 40000, 40000),
  ('IBLT', 3000, 3000, 30000, 30000),
  -- Petits
  ('IDCS', 800, 800, 2000, 2000),
  ('IKFL', 2000, 2000, 15000, 15000),
  ('ITEY', 1000, 1000, 5000, 5000),
  ('IBTH', 4000, 4000, 8000, 8000),
  ('ISKP', 3000, 3000, 10000, 10000),
  ('ILKL', 500, 500, 3000, 3000),
  ('IBAR', 2000, 2000, 5000, 5000),
  ('IHEN', 1500, 1500, 12000, 12000),
  ('ITRC', 1000, 1000, 5000, 5000),
  ('IBRD', 1000, 1000, 2000, 2000),
  ('IUFO', 500, 500, 8000, 8000),
  -- Militaires
  ('IIAB', 3000, 3000, 50000, 50000),
  ('IGAR', 2000, 2000, 40000, 40000),
  ('ISCM', 2000, 2000, 35000, 35000)
ON CONFLICT (code_oaci) DO NOTHING;

-- =====================================================
-- 12) Commentaires
-- =====================================================
COMMENT ON TABLE  public.aeroports IS 'État dynamique des aéroports (stocks PAX/CARGO + dernier vol arrivé)';
COMMENT ON COLUMN public.aeroports.last_flight_arrival IS 'Timestamp du dernier vol arrivé sur cet aéroport (utilisé pour le bonus d''isolement)';
COMMENT ON FUNCTION public.enregistrer_arrivee_vol IS 'Met à jour last_flight_arrival lors de la clôture d''un vol pour cet aéroport d''arrivée';

COMMIT;
