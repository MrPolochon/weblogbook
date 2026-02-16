-- ============================================================
-- MIGRATION OBLIGATOIRE - À exécuter dans l'éditeur SQL Supabase
-- Ce script est IDEMPOTENT (safe à exécuter plusieurs fois)
-- ============================================================

-- ============================================================
-- 1. FIX: vols_ferry pilote_id nullable (vols ferry automatiques)
-- ============================================================
ALTER TABLE public.vols_ferry ALTER COLUMN pilote_id DROP NOT NULL;

-- ============================================================
-- 1b. FIX: plans_vol pilote_id nullable (strips manuels ATC sans pilote)
-- ============================================================
ALTER TABLE public.plans_vol ALTER COLUMN pilote_id DROP NOT NULL;

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

-- Champs texte libre pour les strips manuels
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS strip_pilote_text TEXT,
  ADD COLUMN IF NOT EXISTS strip_type_wake TEXT;

-- Index pour ordonner les strips par zone
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);

-- ============================================================
-- 4. DOCUMENTS - Dossiers imbriqués (parent_id pour arborescence)
-- ============================================================
ALTER TABLE public.document_sections
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.document_sections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_document_sections_parent ON public.document_sections (parent_id);

-- ============================================================
-- 5. COMPAGNIES - Code OACI et nom radio (callsign téléphonie)
--    Permet aux PDG de définir AFR = AIRFRANCE, LUF = LUFTHANSA, etc.
-- ============================================================
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS code_oaci TEXT,
  ADD COLUMN IF NOT EXISTS callsign_telephonie TEXT;

COMMENT ON COLUMN public.compagnies.code_oaci IS 'Code OACI 3 lettres de la compagnie (ex: AFR, LUF, BAW)';
COMMENT ON COLUMN public.compagnies.callsign_telephonie IS 'Nom radio de la compagnie (ex: AIRFRANCE, LUFTHANSA, SPEEDBIRD)';

-- ============================================================
-- 6. Vérification: cette requête doit retourner 12 colonnes strip
-- ============================================================
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'plans_vol' 
  AND column_name LIKE 'strip_%'
ORDER BY column_name;
