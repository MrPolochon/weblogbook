-- ============================================================
-- FLIGHT STRIPS - Champs supplémentaires pour les strips ATC
-- ============================================================

-- Champs strip sur plans_vol
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS strip_atd TEXT,            -- Actual Time of Departure (saisi par ATC)
  ADD COLUMN IF NOT EXISTS strip_rwy TEXT,            -- Runway (saisi par ATC)
  ADD COLUMN IF NOT EXISTS strip_fl TEXT,             -- Flight Level (saisi par ATC)
  ADD COLUMN IF NOT EXISTS strip_fl_unit TEXT DEFAULT 'FL' CHECK (strip_fl_unit IN ('FL', 'ft')),
  ADD COLUMN IF NOT EXISTS strip_sid_atc TEXT,        -- SID (modifiable par ATC)
  ADD COLUMN IF NOT EXISTS strip_note_1 TEXT,         -- Case libre (entre TailNo et squawk)
  ADD COLUMN IF NOT EXISTS strip_note_2 TEXT,         -- Revised clearance
  ADD COLUMN IF NOT EXISTS strip_note_3 TEXT,         -- Other info
  ADD COLUMN IF NOT EXISTS strip_zone TEXT CHECK (strip_zone IN ('sol', 'depart', 'arrivee')),
  ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0;

-- Index pour ordonner les strips par zone
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);
