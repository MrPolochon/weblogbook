-- ============================================================
-- MIGRATION : ACTIVATION DES OPTIONS D'ALLIANCE
-- ============================================================
-- Ajoute le pourcentage de codeshare par membre (chaque PDG
-- définit son propre % de partage des revenus).
-- ============================================================

ALTER TABLE public.alliance_membres
  ADD COLUMN IF NOT EXISTS codeshare_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (codeshare_pourcent >= 0 AND codeshare_pourcent <= 100);
