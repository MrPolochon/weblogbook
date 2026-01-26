-- ============================================================
-- GESTION COMPAGNIE - Hubs, Avions individuels, Vols ferry
-- ============================================================

-- 1) Ajouter pdg_id à compagnies
ALTER TABLE public.compagnies ADD COLUMN IF NOT EXISTS pdg_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) Table des hubs de compagnie
CREATE TABLE IF NOT EXISTS public.compagnie_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  aeroport_code TEXT NOT NULL,
  est_hub_principal BOOLEAN NOT NULL DEFAULT false,
  prix_achat INTEGER NOT NULL DEFAULT 0,
  achat_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, aeroport_code)
);

-- 3) Table des avions individuels de compagnie
CREATE TABLE IF NOT EXISTS public.compagnie_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  immatriculation TEXT NOT NULL UNIQUE,
  nom_bapteme TEXT,
  usure_percent INTEGER NOT NULL DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  aeroport_actuel TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'maintenance', 'bloque')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Table des vols ferry
CREATE TABLE IF NOT EXISTS public.vols_ferry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  aeroport_depart TEXT NOT NULL,
  aeroport_arrivee TEXT NOT NULL,
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'planned' CHECK (statut IN ('planned', 'in_progress', 'completed', 'cancelled')),
  duree_minutes INTEGER,
  usure_appliquee INTEGER,
  cout_ferry INTEGER NOT NULL DEFAULT 0,
  debloque_pour_ferry BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 5) RLS pour les nouvelles tables
ALTER TABLE public.compagnie_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnie_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vols_ferry ENABLE ROW LEVEL SECURITY;

-- Fonction helper: est PDG de la compagnie
CREATE OR REPLACE FUNCTION public.is_pdg(comp_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.compagnies
    WHERE id = comp_id AND pdg_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- compagnie_hubs: lecture tous, CRUD PDG ou admin
DROP POLICY IF EXISTS "hubs_select" ON public.compagnie_hubs;
CREATE POLICY "hubs_select" ON public.compagnie_hubs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hubs_insert" ON public.compagnie_hubs;
CREATE POLICY "hubs_insert" ON public.compagnie_hubs FOR INSERT TO authenticated
  WITH CHECK (public.is_pdg(compagnie_id) OR public.is_admin());

DROP POLICY IF EXISTS "hubs_update" ON public.compagnie_hubs;
CREATE POLICY "hubs_update" ON public.compagnie_hubs FOR UPDATE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

DROP POLICY IF EXISTS "hubs_delete" ON public.compagnie_hubs;
CREATE POLICY "hubs_delete" ON public.compagnie_hubs FOR DELETE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

-- compagnie_avions: lecture tous, CRUD PDG ou admin
DROP POLICY IF EXISTS "avions_select" ON public.compagnie_avions;
CREATE POLICY "avions_select" ON public.compagnie_avions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "avions_insert" ON public.compagnie_avions;
CREATE POLICY "avions_insert" ON public.compagnie_avions FOR INSERT TO authenticated
  WITH CHECK (public.is_pdg(compagnie_id) OR public.is_admin());

DROP POLICY IF EXISTS "avions_update" ON public.compagnie_avions;
CREATE POLICY "avions_update" ON public.compagnie_avions FOR UPDATE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

DROP POLICY IF EXISTS "avions_delete" ON public.compagnie_avions;
CREATE POLICY "avions_delete" ON public.compagnie_avions FOR DELETE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

-- vols_ferry: lecture tous, CRUD PDG ou admin ou pilote assigné
DROP POLICY IF EXISTS "ferry_select" ON public.vols_ferry;
CREATE POLICY "ferry_select" ON public.vols_ferry FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ferry_insert" ON public.vols_ferry;
CREATE POLICY "ferry_insert" ON public.vols_ferry FOR INSERT TO authenticated
  WITH CHECK (public.is_pdg(compagnie_id) OR public.is_admin());

DROP POLICY IF EXISTS "ferry_update" ON public.vols_ferry;
CREATE POLICY "ferry_update" ON public.vols_ferry FOR UPDATE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin() OR pilote_id = auth.uid());

DROP POLICY IF EXISTS "ferry_delete" ON public.vols_ferry;
CREATE POLICY "ferry_delete" ON public.vols_ferry FOR DELETE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

-- 6) Trigger pour bloquer l'avion automatiquement à 0% d'usure
CREATE OR REPLACE FUNCTION public.compagnie_avions_bloque_auto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.usure_percent = 0 AND OLD.usure_percent > 0 AND NEW.statut != 'in_flight' THEN
    NEW.statut = 'bloque';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compagnie_avions_bloque_auto ON public.compagnie_avions;
CREATE TRIGGER compagnie_avions_bloque_auto BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.compagnie_avions_bloque_auto();

-- 7) Trigger updated_at pour compagnie_avions
DROP TRIGGER IF EXISTS compagnie_avions_updated_at ON public.compagnie_avions;
CREATE TRIGGER compagnie_avions_updated_at BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
