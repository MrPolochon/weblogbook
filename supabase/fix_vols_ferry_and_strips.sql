-- ============================================================
-- MIGRATION OBLIGATOIRE - À exécuter dans l'éditeur SQL Supabase
-- Ce script est IDEMPOTENT (safe à exécuter plusieurs fois)
-- ============================================================

-- ============================================================
-- 1. FIX: vols_ferry pilote_id nullable (vols ferry automatiques)
-- ============================================================
ALTER TABLE public.vols_ferry ALTER COLUMN pilote_id DROP NOT NULL;

-- ============================================================
-- 2. MAINTENANCE: colonne maintenance_fin_at sur compagnie_avions
-- ============================================================
ALTER TABLE public.compagnie_avions
  ADD COLUMN IF NOT EXISTS maintenance_fin_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.compagnie_avions.maintenance_fin_at IS 'Date de fin de maintenance lorsque des techniciens sont affrétés';

-- ============================================================
-- 3. FLIGHT STRIPS - Champs supplémentaires pour les strips ATC
--    CRITIQUE: sans ces colonnes, les champs éditables des strips
--    ne sauvegarderont pas (le texte disparaît).
-- ============================================================
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS strip_atd TEXT,
  ADD COLUMN IF NOT EXISTS strip_rwy TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl_unit TEXT DEFAULT 'FL',
  ADD COLUMN IF NOT EXISTS strip_sid_atc TEXT,
  ADD COLUMN IF NOT EXISTS strip_star TEXT,
  ADD COLUMN IF NOT EXISTS strip_route TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_1 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_2 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_3 TEXT,
  ADD COLUMN IF NOT EXISTS strip_zone TEXT,
  ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0;

-- Index pour ordonner les strips par zone
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);

-- ============================================================
-- 4. Vérification: cette requête doit retourner 12 colonnes strip
-- ============================================================
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'plans_vol' 
  AND column_name LIKE 'strip_%'
ORDER BY column_name;
