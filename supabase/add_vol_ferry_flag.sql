-- ============================================================
-- AJOUTER FLAG VOL FERRY aux plans de vol
-- ============================================================

-- Ajouter la colonne vol_ferry à plans_vol
ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS vol_ferry BOOLEAN NOT NULL DEFAULT false;

-- Index pour les vols ferry
CREATE INDEX IF NOT EXISTS idx_plans_vol_ferry ON public.plans_vol(vol_ferry) WHERE vol_ferry = true;

-- Commentaire
COMMENT ON COLUMN public.plans_vol.vol_ferry IS 'Vol à vide pour déplacer un avion - pas de passagers/cargo, compagnie paie les taxes';
