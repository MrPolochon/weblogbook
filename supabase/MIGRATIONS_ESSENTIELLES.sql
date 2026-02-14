-- ============================================================
-- MIGRATIONS ESSENTIELLES - Corrections des bugs du code
-- Date: 10 février 2026
-- ============================================================
-- Ce fichier contient UNIQUEMENT les corrections nécessaires
-- pour faire fonctionner le code (pas de RLS)
-- ============================================================

-- ============================================================
-- 1. CONTRAINTE ROLE : Ajouter 'siavi'
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa', 'siavi'));
    RAISE NOTICE '✅ Contrainte role mise à jour';
  END IF;
END $$;

-- ============================================================
-- 2. CONTRAINTE MESSAGES : Ajouter types manquants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'messages' 
      AND column_name = 'type_message'
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
    ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
      CHECK (type_message IN (
        'normal', 
        'cheque_salaire', 
        'cheque_revenu_compagnie', 
        'cheque_taxes_atc', 
        'recrutement', 
        'sanction_ifsa', 
        'amende_ifsa', 
        'relance_amende', 
        'location_avion',
        'cheque_siavi_intervention',
        'cheque_siavi_taxes'
      ));
    RAISE NOTICE '✅ Contrainte messages mise à jour';
  END IF;
END $$;

-- ============================================================
-- 3. COLONNES FLIGHT STRIPS (si pas déjà faites)
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.plans_vol
    ADD COLUMN IF NOT EXISTS strip_atd TEXT,
    ADD COLUMN IF NOT EXISTS strip_rwy TEXT,
    ADD COLUMN IF NOT EXISTS strip_fl TEXT,
    ADD COLUMN IF NOT EXISTS strip_fl_unit TEXT DEFAULT 'FL',
    ADD COLUMN IF NOT EXISTS strip_sid_atc TEXT,
    ADD COLUMN IF NOT EXISTS strip_note_1 TEXT,
    ADD COLUMN IF NOT EXISTS strip_note_2 TEXT,
    ADD COLUMN IF NOT EXISTS strip_note_3 TEXT,
    ADD COLUMN IF NOT EXISTS strip_zone TEXT,
    ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS strip_star TEXT,
    ADD COLUMN IF NOT EXISTS strip_route TEXT;

  CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);
  
  RAISE NOTICE '✅ Colonnes flight strips ajoutées';
END $$;

-- ============================================================
-- 4. VOLS FERRY : pilote_id nullable
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'vols_ferry' 
      AND column_name = 'pilote_id'
  ) THEN
    ALTER TABLE public.vols_ferry ALTER COLUMN pilote_id DROP NOT NULL;
    RAISE NOTICE '✅ vols_ferry.pilote_id nullable';
  END IF;
END $$;

-- ============================================================
-- 5. MAINTENANCE : colonne maintenance_fin_at
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'compagnie_avions'
  ) THEN
    ALTER TABLE public.compagnie_avions
      ADD COLUMN IF NOT EXISTS maintenance_fin_at TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE '✅ compagnie_avions.maintenance_fin_at ajoutée';
  END IF;
END $$;

-- ============================================================
-- VÉRIFICATIONS FINALES
-- ============================================================
DO $$
DECLARE
  strip_count INTEGER;
BEGIN
  -- Compter les colonnes strip
  SELECT COUNT(*) INTO strip_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'plans_vol' 
    AND column_name LIKE 'strip_%';
  
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ MIGRATION TERMINÉE';
  RAISE NOTICE 'Colonnes strip trouvées: %', strip_count;
  RAISE NOTICE '==============================================';
END $$;

-- ============================================================
-- 6) Colonne dernier_changement_principal_at sur compagnies
--    (cooldown 1 semaine pour changer le hub principal)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compagnies'
      AND column_name = 'dernier_changement_principal_at'
  ) THEN
    ALTER TABLE public.compagnies
      ADD COLUMN dernier_changement_principal_at TIMESTAMPTZ;
    RAISE NOTICE '✅ Colonne dernier_changement_principal_at ajoutée à compagnies';
  ELSE
    RAISE NOTICE 'ℹ️ Colonne dernier_changement_principal_at existe déjà';
  END IF;
END $$;

-- ============================================================
-- 7) Colonne logo_url sur compagnies (logo de la compagnie)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compagnies'
      AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE public.compagnies
      ADD COLUMN logo_url TEXT;
    RAISE NOTICE '✅ Colonne logo_url ajoutée à compagnies';
  ELSE
    RAISE NOTICE 'ℹ️ Colonne logo_url existe déjà';
  END IF;
END $$;

-- ============================================================
-- 8) Table vhf_position_frequencies (radio VHF par position ATC/AFIS)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'vhf_position_frequencies'
  ) THEN
    CREATE TABLE public.vhf_position_frequencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aeroport TEXT NOT NULL,
      position TEXT NOT NULL,
      frequency TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(aeroport, position),
      UNIQUE(frequency)
    );
    -- RLS : lecture pour tous les authentifiés, écriture admin only
    ALTER TABLE public.vhf_position_frequencies ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vhf_freq_select" ON public.vhf_position_frequencies
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "vhf_freq_admin" ON public.vhf_position_frequencies
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
    RAISE NOTICE '✅ Table vhf_position_frequencies créée avec RLS';
  ELSE
    RAISE NOTICE 'ℹ️ Table vhf_position_frequencies existe déjà';
  END IF;
END $$;

-- ============================================================
-- 9) Seed des fréquences VHF par aéroport / position
--    TWR : 118-119  |  GND : 121  |  APP : 119-120  |  CTR : 124-130
-- ============================================================
INSERT INTO public.vhf_position_frequencies (aeroport, position, frequency) VALUES
  -- ITKO (Tokyo)
  ('ITKO', 'Tower',   '118.050'),
  ('ITKO', 'Ground',  '121.625'),
  ('ITKO', 'APP',     '119.300'),
  ('ITKO', 'Center',  '124.850'),
  -- IPPH (Perth)
  ('IPPH', 'Tower',   '118.700'),
  ('IPPH', 'Ground',  '121.900'),
  ('IPPH', 'APP',     '120.175'),
  ('IPPH', 'Center',  '125.400'),
  -- IZOL (Izolirani)
  ('IZOL', 'Tower',   '119.150'),
  ('IZOL', 'Ground',  '121.750'),
  ('IZOL', 'APP',     '120.500'),
  ('IZOL', 'Center',  '126.275'),
  -- ILAR (Larnaca)
  ('ILAR', 'Tower',   '118.350'),
  ('ILAR', 'Ground',  '121.680'),
  ('ILAR', 'APP',     '119.850'),
  ('ILAR', 'Center',  '127.525'),
  -- ISAU (Sauthemtoma)
  ('ISAU', 'Tower',   '119.500'),
  ('ISAU', 'Ground',  '121.835'),
  ('ISAU', 'APP',     '120.325'),
  ('ISAU', 'Center',  '128.150'),
  -- IRFD (Greater Rockford)
  ('IRFD', 'Tower',   '118.925'),
  ('IRFD', 'Ground',  '121.700'),
  ('IRFD', 'APP',     '120.775'),
  ('IRFD', 'Center',  '125.050'),
  -- IMLR (Mellor)
  ('IMLR', 'Tower',   '118.450'),
  ('IMLR', 'Ground',  '121.575'),
  ('IMLR', 'APP',     '119.775'),
  ('IMLR', 'Center',  '129.375'),
  -- IGRV (Grindavik)
  ('IGRV', 'Tower',   '119.325'),
  ('IGRV', 'Ground',  '121.850'),
  ('IGRV', 'APP',     '120.600'),
  ('IGRV', 'Center',  '130.275'),
  -- IPAP (Paphos Intl.) — international
  ('IPAP', 'Tower',   '118.575'),
  ('IPAP', 'Ground',  '121.650'),
  ('IPAP', 'APP',     '120.150'),
  ('IPAP', 'Center',  '126.800'),
  -- IJAF (Al Najaf) — régional
  ('IJAF', 'Tower',   '118.275'),
  ('IJAF', 'Ground',  '121.525'),
  ('IJAF', 'APP',     '120.025'),
  -- IBLT (Boltic Airfield) — régional
  ('IBLT', 'Tower',   '119.050'),
  ('IBLT', 'Ground',  '121.775'),
  ('IBLT', 'APP',     '120.400'),
  -- IDCS (Saba Airport) — petit
  ('IDCS', 'Tower',   '118.175'),
  ('IDCS', 'Ground',  '121.950'),
  -- IBTH (Saint Barthelemy) — petit
  ('IBTH', 'Tower',   '119.200'),
  ('IBTH', 'Ground',  '121.600'),
  -- ISKP (Skopelos Airfield) — petit
  ('ISKP', 'Tower',   '118.800'),
  ('ISKP', 'Ground',  '121.500'),
  -- ILKL (Lukla Airport) — petit
  ('ILKL', 'Tower',   '118.150'),
  ('ILKL', 'Ground',  '121.975'),
  -- IBAR (Barra Airport) — petit
  ('IBAR', 'Tower',   '119.400'),
  ('IBAR', 'Ground',  '121.550'),
  -- IHEN (Henstridge Airfield) — petit
  ('IHEN', 'Tower',   '118.625'),
  ('IHEN', 'Ground',  '121.800'),
  -- ITRC (Training Centre) — petit
  ('ITRC', 'Tower',   '119.075'),
  ('ITRC', 'Ground',  '121.725'),
  -- IBRD (Bird Island Airfield) — petit
  ('IBRD', 'Tower',   '118.500'),
  ('IBRD', 'Ground',  '121.475'),
  -- IUFO (UFO Base) — petit
  ('IUFO', 'Tower',   '119.550'),
  ('IUFO', 'Ground',  '121.425'),
  -- IIAB (McConnell AFB) — militaire
  ('IIAB', 'Tower',   '118.100'),
  ('IIAB', 'Ground',  '121.300'),
  ('IIAB', 'APP',     '120.850'),
  -- IGAR (Air Base Garry) — militaire
  ('IGAR', 'Tower',   '119.600'),
  ('IGAR', 'Ground',  '121.350'),
  ('IGAR', 'APP',     '120.925'),
  -- ISCM (RAF Scampton) — militaire
  ('ISCM', 'Tower',   '118.875'),
  ('ISCM', 'Ground',  '121.250'),
  ('ISCM', 'APP',     '120.275')
ON CONFLICT DO NOTHING;
