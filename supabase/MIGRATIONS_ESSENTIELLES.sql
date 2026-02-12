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
