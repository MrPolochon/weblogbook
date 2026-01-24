-- =====================================================
-- MARCHÉ CARGO - Migration SQL
-- =====================================================

-- Table pour stocker le cargo disponible par aéroport
CREATE TABLE IF NOT EXISTS public.aeroport_cargo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  cargo_disponible INTEGER NOT NULL DEFAULT 0,
  cargo_max INTEGER NOT NULL DEFAULT 0,
  derniere_regeneration TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la recherche rapide
CREATE INDEX IF NOT EXISTS idx_aeroport_cargo_code ON public.aeroport_cargo(code_oaci);

-- Activer RLS
ALTER TABLE public.aeroport_cargo ENABLE ROW LEVEL SECURITY;

-- Politique de lecture pour tous les utilisateurs authentifiés
CREATE POLICY "aeroport_cargo_select" ON public.aeroport_cargo
  FOR SELECT TO authenticated USING (true);

-- Politique de modification pour service_role uniquement (via RPC)
CREATE POLICY "aeroport_cargo_update" ON public.aeroport_cargo
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "aeroport_cargo_insert" ON public.aeroport_cargo
  FOR INSERT TO service_role WITH CHECK (true);

-- Insérer les données initiales pour chaque aéroport
INSERT INTO public.aeroport_cargo (code_oaci, cargo_disponible, cargo_max) VALUES
  -- Aéroports internationaux (industriels = plus de cargo)
  ('ITKO', 150000, 150000),
  ('IPPH', 120000, 120000),
  ('ILAR', 80000, 80000),
  ('IPAP', 50000, 50000),
  ('IRFD', 200000, 200000),
  ('IMLR', 180000, 180000),
  ('IZOL', 100000, 100000),
  -- Aéroports régionaux
  ('ISAU', 60000, 60000),
  ('IJAF', 40000, 40000),
  ('IBLT', 30000, 30000),
  -- Petits aéroports
  ('IDCS', 2000, 2000),
  ('IGRV', 15000, 15000),
  ('IBTH', 8000, 8000),
  ('ISKP', 10000, 10000),
  ('ILKL', 3000, 3000),
  ('IBAR', 5000, 5000),
  ('IHEN', 12000, 12000),
  ('ITRC', 5000, 5000),
  ('IBRD', 2000, 2000),
  ('IUFO', 8000, 8000),
  -- Bases militaires
  ('IIAB', 50000, 50000),
  ('IGAR', 40000, 40000),
  ('ISCM', 35000, 35000)
ON CONFLICT (code_oaci) DO NOTHING;

-- =====================================================
-- FONCTION: Régénération du cargo
-- =====================================================
CREATE OR REPLACE FUNCTION public.regenerer_cargo_aeroport()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  regen_interval INTERVAL := '30 minutes';
  regen_rate NUMERIC := 0.15; -- 15% de régénération par cycle
BEGIN
  -- Régénérer le cargo pour les aéroports qui n'ont pas été mis à jour récemment
  UPDATE public.aeroport_cargo
  SET 
    cargo_disponible = LEAST(
      cargo_max,
      cargo_disponible + CEIL(cargo_max * regen_rate)::INTEGER
    ),
    derniere_regeneration = NOW()
  WHERE derniere_regeneration < NOW() - regen_interval;
END;
$$;

-- =====================================================
-- FONCTION: Consommer du cargo lors d'un vol
-- =====================================================
CREATE OR REPLACE FUNCTION public.consommer_cargo(
  p_code_oaci TEXT,
  p_quantite INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cargo_disponible INTEGER;
BEGIN
  -- Vérifier le cargo disponible
  SELECT cargo_disponible INTO v_cargo_disponible
  FROM public.aeroport_cargo
  WHERE code_oaci = p_code_oaci;

  IF v_cargo_disponible IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_cargo_disponible < p_quantite THEN
    RETURN FALSE;
  END IF;

  -- Consommer le cargo
  UPDATE public.aeroport_cargo
  SET cargo_disponible = cargo_disponible - p_quantite
  WHERE code_oaci = p_code_oaci;

  RETURN TRUE;
END;
$$;

-- =====================================================
-- FONCTION: Livrer du cargo à un aéroport
-- =====================================================
CREATE OR REPLACE FUNCTION public.livrer_cargo(
  p_code_oaci TEXT,
  p_quantite INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ajouter le cargo livré (peut dépasser temporairement le max pour simuler un surplus)
  UPDATE public.aeroport_cargo
  SET cargo_disponible = LEAST(
    cargo_max * 1.2, -- Maximum 120% du max pour éviter les abus
    cargo_disponible + p_quantite
  )
  WHERE code_oaci = p_code_oaci;

  RETURN TRUE;
END;
$$;

-- Commentaires
COMMENT ON TABLE public.aeroport_cargo IS 'Stock de cargo disponible par aéroport';
COMMENT ON FUNCTION public.regenerer_cargo_aeroport IS 'Régénère le cargo disponible dans tous les aéroports';
COMMENT ON FUNCTION public.consommer_cargo IS 'Consomme du cargo lors du chargement d''un vol';
COMMENT ON FUNCTION public.livrer_cargo IS 'Ajoute du cargo livré à un aéroport';
