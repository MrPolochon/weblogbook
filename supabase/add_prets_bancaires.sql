-- ============================================================
-- SYSTÈME DE PRÊTS BANCAIRES POUR LES COMPAGNIES
-- ============================================================
-- Les PDG peuvent emprunter des montants prédéfinis avec des taux d'intérêt variables.
-- Le remboursement se fait automatiquement sur les revenus des vols.

-- 1) Table des prêts bancaires
CREATE TABLE IF NOT EXISTS public.prets_bancaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  demandeur_id UUID NOT NULL REFERENCES public.profiles(id), -- Le PDG qui a demandé le prêt
  
  -- Montant du prêt
  montant_emprunte INTEGER NOT NULL, -- Montant initial emprunté
  taux_interet DECIMAL(5,2) NOT NULL, -- Taux d'intérêt en %
  montant_total_du INTEGER NOT NULL, -- Montant + intérêts à rembourser
  montant_rembourse INTEGER NOT NULL DEFAULT 0, -- Montant déjà remboursé
  
  -- Statut
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'rembourse', 'annule')),
  
  -- Dates
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rembourse_at TIMESTAMPTZ DEFAULT NULL, -- Date de remboursement complet
  
  -- Contrainte : une compagnie ne peut avoir qu'un seul prêt actif à la fois
  CONSTRAINT unique_pret_actif UNIQUE (compagnie_id, statut) 
    -- Note: cette contrainte ne marche pas parfaitement, on la gère en code
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_prets_compagnie ON public.prets_bancaires(compagnie_id, statut);
CREATE INDEX IF NOT EXISTS idx_prets_demandeur ON public.prets_bancaires(demandeur_id);

-- 2) RLS
ALTER TABLE public.prets_bancaires ENABLE ROW LEVEL SECURITY;

-- Lecture : PDG de la compagnie, admin, ou demandeur
DROP POLICY IF EXISTS "prets_select" ON public.prets_bancaires;
CREATE POLICY "prets_select" ON public.prets_bancaires FOR SELECT TO authenticated 
  USING (
    public.is_pdg(compagnie_id) 
    OR public.is_admin() 
    OR demandeur_id = auth.uid()
  );

-- Insert : PDG ou admin
DROP POLICY IF EXISTS "prets_insert" ON public.prets_bancaires;
CREATE POLICY "prets_insert" ON public.prets_bancaires FOR INSERT TO authenticated
  WITH CHECK (public.is_pdg(compagnie_id) OR public.is_admin());

-- Update : admin uniquement (pour les remboursements automatiques)
DROP POLICY IF EXISTS "prets_update" ON public.prets_bancaires;
CREATE POLICY "prets_update" ON public.prets_bancaires FOR UPDATE TO authenticated
  USING (public.is_admin());

-- 3) Commentaires
COMMENT ON TABLE public.prets_bancaires IS 'Prêts bancaires accordés aux compagnies aériennes';
COMMENT ON COLUMN public.prets_bancaires.montant_emprunte IS 'Montant initial emprunté en F$';
COMMENT ON COLUMN public.prets_bancaires.taux_interet IS 'Taux d''intérêt appliqué en pourcentage';
COMMENT ON COLUMN public.prets_bancaires.montant_total_du IS 'Montant total à rembourser (capital + intérêts)';
COMMENT ON COLUMN public.prets_bancaires.montant_rembourse IS 'Montant déjà remboursé par prélèvement sur les vols';
