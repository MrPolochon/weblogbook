-- ============================================================
-- HANGAR MARKET - Marketplace d'avions d'occasion
-- ============================================================

-- Table pour les annonces du marché d'occasion
CREATE TABLE IF NOT EXISTS public.hangar_market (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vendeur (soit particulier soit compagnie)
  vendeur_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_vendeur_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  
  -- Avion à vendre
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id),
  inventaire_avion_id UUID REFERENCES public.inventaire_avions(id) ON DELETE CASCADE,
  flotte_avion_id UUID REFERENCES public.compagnie_flotte(id) ON DELETE SET NULL,
  
  -- Détails de l'annonce
  titre TEXT NOT NULL,
  description TEXT,
  prix INTEGER NOT NULL CHECK (prix > 0),
  etat TEXT NOT NULL DEFAULT 'bon' CHECK (etat IN ('neuf', 'excellent', 'bon', 'correct', 'usé')),
  
  -- Statut
  statut TEXT NOT NULL DEFAULT 'en_vente' CHECK (statut IN ('en_vente', 'vendu', 'annulé')),
  
  -- Acheteur (si vendu)
  acheteur_id UUID REFERENCES public.profiles(id),
  compagnie_acheteur_id UUID REFERENCES public.compagnies(id),
  vendu_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Contrainte : vendeur_id OU compagnie_vendeur_id (pas les deux vides)
  CONSTRAINT vendeur_check CHECK (vendeur_id IS NOT NULL OR compagnie_vendeur_id IS NOT NULL)
);

-- Table pour les taxes de vente (configurable par les admins)
CREATE TABLE IF NOT EXISTS public.hangar_market_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxe_vente_pourcent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insérer la config par défaut (5% de taxe)
INSERT INTO public.hangar_market_config (taxe_vente_pourcent)
SELECT 5.00
WHERE NOT EXISTS (SELECT 1 FROM public.hangar_market_config);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_hangar_market_statut ON public.hangar_market(statut);
CREATE INDEX IF NOT EXISTS idx_hangar_market_vendeur ON public.hangar_market(vendeur_id);
CREATE INDEX IF NOT EXISTS idx_hangar_market_compagnie ON public.hangar_market(compagnie_vendeur_id);
CREATE INDEX IF NOT EXISTS idx_hangar_market_type_avion ON public.hangar_market(type_avion_id);

-- RLS
ALTER TABLE public.hangar_market ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hangar_market_config ENABLE ROW LEVEL SECURITY;

-- Policies pour hangar_market
CREATE POLICY "hangar_market_select" ON public.hangar_market 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "hangar_market_insert" ON public.hangar_market 
  FOR INSERT TO authenticated 
  WITH CHECK (
    vendeur_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.compagnies 
      WHERE id = compagnie_vendeur_id AND pdg_id = auth.uid()
    )
  );

CREATE POLICY "hangar_market_update" ON public.hangar_market 
  FOR UPDATE TO authenticated 
  USING (
    vendeur_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.compagnies 
      WHERE id = compagnie_vendeur_id AND pdg_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "hangar_market_delete" ON public.hangar_market 
  FOR DELETE TO authenticated 
  USING (
    vendeur_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.compagnies 
      WHERE id = compagnie_vendeur_id AND pdg_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Policies pour hangar_market_config (lecture tous, écriture admin)
CREATE POLICY "hangar_market_config_select" ON public.hangar_market_config 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "hangar_market_config_all_admin" ON public.hangar_market_config 
  FOR ALL TO authenticated 
  USING (public.is_admin()) 
  WITH CHECK (public.is_admin());

-- Trigger updated_at
CREATE TRIGGER hangar_market_updated_at 
  BEFORE UPDATE ON public.hangar_market
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hangar_market_config_updated_at 
  BEFORE UPDATE ON public.hangar_market_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
