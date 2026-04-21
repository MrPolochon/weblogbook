-- ============================================================
-- MEDEVAC MULTI-SEGMENTS
-- Support des missions MEDEVAC avec plusieurs destinations
-- (ex: IRFD -> IBTH -> IPPH -> ITKO), chaque segment etant
-- un plan_vol independant relie par medevac_mission_id.
-- ============================================================

-- 1) Colonnes de liaison entre segments d'une meme mission MEDEVAC
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS medevac_mission_id UUID,
  ADD COLUMN IF NOT EXISTS medevac_segment_index INTEGER,
  ADD COLUMN IF NOT EXISTS medevac_total_segments INTEGER,
  ADD COLUMN IF NOT EXISTS medevac_next_plan_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_medevac_mission ON public.plans_vol(medevac_mission_id);
CREATE INDEX IF NOT EXISTS idx_plans_vol_medevac_next ON public.plans_vol(medevac_next_plan_id);

-- 2) Nouveaux statuts : 'planifie_suivant' (segment futur non encore actif)
--    et 'en_pause' (segment cloture, en attente de reprise de mission)
ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut IN (
  'depose', 'en_attente', 'accepte', 'refuse', 'annule',
  'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture',
  'planifie_suivant', 'en_pause'
));

-- 3) Contrainte : medevac_segment_index >= 1 si defini
ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_medevac_segment_index_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_medevac_segment_index_check
  CHECK (medevac_segment_index IS NULL OR medevac_segment_index >= 1);

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_medevac_total_segments_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_medevac_total_segments_check
  CHECK (medevac_total_segments IS NULL OR medevac_total_segments BETWEEN 1 AND 5);

DO $$ BEGIN
  RAISE NOTICE 'Migration MEDEVAC multi-segments appliquee : colonnes medevac_mission_id / segment_index / total_segments / next_plan_id, statuts planifie_suivant et en_pause ajoutes.';
END $$;
