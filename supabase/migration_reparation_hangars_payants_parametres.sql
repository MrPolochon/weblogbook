-- ============================================================
-- Hangars payants (comme hubs) + Paramètres entreprise (PDG)
-- Prix configurable, option alliance avec tarif réduit
-- ============================================================

-- 1) Paramètres entreprise (prix hangar, alliance)
ALTER TABLE public.entreprises_reparation
  ADD COLUMN IF NOT EXISTS prix_hangar_base INTEGER NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS prix_hangar_multiplicateur INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS alliance_reparation_actif BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alliance_id UUID REFERENCES public.alliances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prix_alliance_pourcent INTEGER NOT NULL DEFAULT 80 CHECK (prix_alliance_pourcent >= 0 AND prix_alliance_pourcent <= 100);

COMMENT ON COLUMN public.entreprises_reparation.prix_hangar_base IS 'Prix de base pour le 2e hangar (1er gratuit). Même logique que les hubs.';
COMMENT ON COLUMN public.entreprises_reparation.prix_hangar_multiplicateur IS 'Multiplicateur à chaque hangar supplémentaire (ex: 2 = doublement)';
COMMENT ON COLUMN public.entreprises_reparation.alliance_reparation_actif IS 'Si true, les membres de l''alliance sélectionnée bénéficient du tarif réduit';
COMMENT ON COLUMN public.entreprises_reparation.alliance_id IS 'Alliance sélectionnée pour le tarif réduit (une seule possible)';
COMMENT ON COLUMN public.entreprises_reparation.prix_alliance_pourcent IS 'Pourcentage du tarif normal pour les membres alliance (80 = 20% de réduction)';

-- 2) Prix d'achat sur reparation_hangars (comme compagnie_hubs)
ALTER TABLE public.reparation_hangars
  ADD COLUMN IF NOT EXISTS prix_achat INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS achat_le TIMESTAMPTZ;
