-- ============================================================
-- HANGAR MARKET - Vente d'avions de flotte par les PDG
-- Option : visible par tout le monde ou par les PDG uniquement
-- ============================================================

-- Référence vers un avion de flotte (compagnie_avions)
ALTER TABLE public.hangar_market
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;

-- Visibilité : si true, seuls les PDG voient et peuvent acheter l'annonce
ALTER TABLE public.hangar_market
  ADD COLUMN IF NOT EXISTS vente_pdg_seulement BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hangar_market.compagnie_avion_id IS 'Avion de flotte compagnie mis en vente (par le PDG)';
COMMENT ON COLUMN public.hangar_market.vente_pdg_seulement IS 'Si true, annonce visible et achetable uniquement par les PDG';

CREATE INDEX IF NOT EXISTS idx_hangar_market_compagnie_avion ON public.hangar_market(compagnie_avion_id);
CREATE INDEX IF NOT EXISTS idx_hangar_market_vente_pdg_seulement ON public.hangar_market(vente_pdg_seulement) WHERE vente_pdg_seulement = true;
