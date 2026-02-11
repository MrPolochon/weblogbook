-- ============================================================
-- FIX: vols_ferry pilote_id nullable (pour vols ferry automatiques)
-- ============================================================
ALTER TABLE public.vols_ferry ALTER COLUMN pilote_id DROP NOT NULL;

-- ============================================================
-- FLIGHT STRIPS - Champs supplémentaires pour les strips ATC
-- ============================================================

-- Champs strip sur plans_vol
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
  ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0;

-- Index pour ordonner les strips par zone
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);
