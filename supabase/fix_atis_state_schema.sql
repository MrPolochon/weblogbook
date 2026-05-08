-- =============================================================================
-- Fix : ajoute les colonnes manquantes a atis_broadcast_state
-- =============================================================================
-- Necessaire pour les deploiements ou la table a ete creee avec un schema
-- pre-multi-instance (sans `source`, `started_at`, `position`).
--
-- 100% idempotent. Ne touche jamais aux donnees existantes.
-- =============================================================================

BEGIN;

-- Colonne `source` : trace l'origine du broadcast (site ou Discord).
ALTER TABLE public.atis_broadcast_state
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Ajoute la CHECK constraint sur source (si pas deja la).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atis_broadcast_state'::regclass
      AND conname = 'atis_broadcast_state_source_check'
  ) THEN
    ALTER TABLE public.atis_broadcast_state
      ADD CONSTRAINT atis_broadcast_state_source_check
      CHECK (source IS NULL OR source IN ('site', 'discord'));
  END IF;
END$$;

-- Colonne `started_at` : timestamp du debut de broadcast.
ALTER TABLE public.atis_broadcast_state
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Colonne `position` : poste ATC (TWR, APP, GND, ...) controlant le broadcast.
ALTER TABLE public.atis_broadcast_state
  ADD COLUMN IF NOT EXISTS position TEXT;

-- Filet de securite : si la colonne `aeroport` n'est pas non plus la.
ALTER TABLE public.atis_broadcast_state
  ADD COLUMN IF NOT EXISTS aeroport TEXT;

COMMIT;

-- =============================================================================
-- Verification : le schema doit contenir toutes ces colonnes
-- =============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'atis_broadcast_state'
-- ORDER BY ordinal_position;
--
-- Resultat attendu :
--   id                    text          NO
--   controlling_user_id   uuid          YES
--   broadcasting          boolean       NO
--   updated_at            timestamptz   NO
--   aeroport              text          YES
--   position              text          YES
--   source                text          YES
--   started_at            timestamptz   YES
-- =============================================================================
