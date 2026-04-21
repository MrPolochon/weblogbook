-- ============================================================
-- SYSTÈME INSTITUTIONNEL SIAVI
-- Flotte MEDEVAC, Banque SIAVI, Hubs, Configuration
-- ============================================================

-- 1) Élargir la contrainte de type felitz_comptes pour inclure 'siavi'
DO $$ BEGIN
  ALTER TABLE public.felitz_comptes DROP CONSTRAINT IF EXISTS felitz_comptes_type_check;
  ALTER TABLE public.felitz_comptes ADD CONSTRAINT felitz_comptes_type_check
    CHECK (type IN ('personnel', 'entreprise', 'militaire', 'alliance', 'reparation', 'siavi'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Contrainte felitz_comptes_type_check non modifiée: %', SQLERRM;
END $$;

-- 2) Créer le compte SIAVI unique (comme le compte militaire)
INSERT INTO public.felitz_comptes (type, vban, solde)
SELECT 'siavi', 'SIAVIMIXOU000001', 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.felitz_comptes WHERE type = 'siavi'
);

-- 3) Table des hubs SIAVI
CREATE TABLE IF NOT EXISTS public.siavi_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport_oaci TEXT NOT NULL UNIQUE,
  is_principal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.siavi_hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siavi_hubs_select" ON public.siavi_hubs;
CREATE POLICY "siavi_hubs_select" ON public.siavi_hubs FOR SELECT TO authenticated USING (true);

-- 4) Table de la flotte SIAVI (miroir simplifié de compagnie_avions)
CREATE TABLE IF NOT EXISTS public.siavi_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id),
  immatriculation TEXT NOT NULL UNIQUE,
  nom_personnalise TEXT,
  aeroport_actuel TEXT NOT NULL DEFAULT 'IRFD',
  statut TEXT NOT NULL DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'bloque', 'en_reparation', 'maintenance')),
  usure_percent NUMERIC NOT NULL DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  prix_achat NUMERIC NOT NULL DEFAULT 0,
  maintenance_fin_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siavi_avions_aeroport ON public.siavi_avions(aeroport_actuel);
CREATE INDEX IF NOT EXISTS idx_siavi_avions_statut ON public.siavi_avions(statut);

ALTER TABLE public.siavi_avions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siavi_avions_select" ON public.siavi_avions;
CREATE POLICY "siavi_avions_select" ON public.siavi_avions FOR SELECT TO authenticated USING (true);

-- 5) Table de configuration singleton SIAVI
CREATE TABLE IF NOT EXISTS public.siavi_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pourcentage_salaire_pilote NUMERIC NOT NULL DEFAULT 40 CHECK (pourcentage_salaire_pilote >= 0 AND pourcentage_salaire_pilote <= 100),
  revenu_base_medevac NUMERIC NOT NULL DEFAULT 35000,
  decote_exponentielle_k NUMERIC NOT NULL DEFAULT 0.02,
  revenu_plancher NUMERIC NOT NULL DEFAULT 5000,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.siavi_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.siavi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siavi_config_select" ON public.siavi_config;
CREATE POLICY "siavi_config_select" ON public.siavi_config FOR SELECT TO authenticated USING (true);

-- 6) Colonne siavi_avion_id sur plans_vol
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS siavi_avion_id UUID REFERENCES public.siavi_avions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_siavi_avion ON public.plans_vol(siavi_avion_id);

-- 7) Fonction de calcul du revenu MEDEVAC avec décote exponentielle
CREATE OR REPLACE FUNCTION public.calculate_medevac_revenue(
  p_temps_prev_min NUMERIC,
  p_duree_reelle_min NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_base NUMERIC;
  v_k NUMERIC;
  v_plancher NUMERIC;
  v_retard NUMERIC;
  v_revenu NUMERIC;
BEGIN
  SELECT revenu_base_medevac, decote_exponentielle_k, revenu_plancher
  INTO v_base, v_k, v_plancher
  FROM public.siavi_config
  WHERE id = 1;

  v_retard := GREATEST(0, p_duree_reelle_min - p_temps_prev_min);
  v_revenu := v_base * EXP(-v_k * v_retard);
  RETURN GREATEST(v_plancher, ROUND(v_revenu));
END;
$$ LANGUAGE plpgsql STABLE;

DO $$ BEGIN RAISE NOTICE 'Système institutionnel SIAVI ajouté avec succès'; END $$;
