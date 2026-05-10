-- ============================================================
--  MARKETPLACE : ruptures de stock aleatoires sur types_avion
-- ============================================================
--
-- Chaque avion du marketplace peut entrer aleatoirement en
-- "rupture de stock" pendant une duree comprise entre 6h et 3j.
-- Tant que `rupture_fin_at > now()`, l'avion est non achetable.
--
-- Les colonnes :
--   - rupture_debut_at : moment ou la rupture a demarre (NULL si dispo)
--   - rupture_fin_at   : moment ou elle se termine (NULL si dispo)
--   - prochain_check_rupture_at : prochain tirage de des autorise
--                                 (throttle pour eviter de tirer trop souvent)
--
-- Le tirage des / l'expiration est fait cote serveur (TS) lors de chaque
-- chargement du marketplace, dans `src/lib/marketplace/ruptures.ts`.
-- ============================================================

ALTER TABLE public.types_avion
  ADD COLUMN IF NOT EXISTS rupture_debut_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rupture_fin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prochain_check_rupture_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_types_avion_rupture_fin
  ON public.types_avion (rupture_fin_at)
  WHERE rupture_fin_at IS NOT NULL;
