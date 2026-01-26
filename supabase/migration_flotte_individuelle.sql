-- ============================================================
-- MIGRATION: Flotte individuelle unifiée
-- Remplace le système de quantité par des avions individuels
-- ============================================================

-- 1) S'assurer que compagnie_avions existe (déjà créé dans add_compagnie_gestion.sql)
-- Si pas encore fait, cette migration le crée

CREATE TABLE IF NOT EXISTS public.compagnie_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  immatriculation TEXT NOT NULL UNIQUE,
  nom_bapteme TEXT,
  usure_percent INTEGER NOT NULL DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  aeroport_actuel TEXT NOT NULL DEFAULT 'IRFD',
  statut TEXT NOT NULL DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'maintenance', 'bloque')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Fonction pour générer une immatriculation unique
CREATE OR REPLACE FUNCTION public.generer_immatriculation(prefixe TEXT DEFAULT 'F-')
RETURNS TEXT AS $$
DECLARE
  new_immat TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  i INTEGER;
BEGIN
  LOOP
    new_immat := prefixe;
    FOR i IN 1..4 LOOP
      new_immat := new_immat || substr(chars, floor(random() * 26 + 1)::int, 1);
    END LOOP;
    
    -- Vérifier unicité
    IF NOT EXISTS (SELECT 1 FROM public.compagnie_avions WHERE immatriculation = new_immat) 
       AND NOT EXISTS (SELECT 1 FROM public.inventaire_avions WHERE immatriculation = new_immat) THEN
      RETURN new_immat;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3) Ajouter immatriculation à inventaire_avions si pas présent
ALTER TABLE public.inventaire_avions 
  ADD COLUMN IF NOT EXISTS immatriculation TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS aeroport_actuel TEXT DEFAULT 'IRFD',
  ADD COLUMN IF NOT EXISTS usure_percent INTEGER DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'maintenance', 'bloque'));

-- 4) Générer des immatriculations pour les avions existants sans immat
UPDATE public.inventaire_avions 
SET immatriculation = public.generer_immatriculation('F-')
WHERE immatriculation IS NULL;

-- 5) RLS pour compagnie_avions
ALTER TABLE public.compagnie_avions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compagnie_avions_select" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_select" ON public.compagnie_avions 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compagnie_avions_insert" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_insert" ON public.compagnie_avions 
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

DROP POLICY IF EXISTS "compagnie_avions_update" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_update" ON public.compagnie_avions 
  FOR UPDATE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

DROP POLICY IF EXISTS "compagnie_avions_delete" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_delete" ON public.compagnie_avions 
  FOR DELETE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

-- 6) Trigger pour updated_at
DROP TRIGGER IF EXISTS compagnie_avions_updated_at ON public.compagnie_avions;
CREATE TRIGGER compagnie_avions_updated_at 
  BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Trigger pour bloquer automatiquement à 0% d'usure
CREATE OR REPLACE FUNCTION public.avion_bloque_auto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.usure_percent = 0 AND OLD.usure_percent > 0 AND NEW.statut != 'in_flight' THEN
    NEW.statut := 'bloque';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compagnie_avions_bloque_auto ON public.compagnie_avions;
CREATE TRIGGER compagnie_avions_bloque_auto 
  BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.avion_bloque_auto();

-- 8) Index pour performance
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_compagnie ON public.compagnie_avions(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_statut ON public.compagnie_avions(statut);
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_aeroport ON public.compagnie_avions(aeroport_actuel);

-- 9) Ajouter compagnie_avion_id à plans_vol
ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_compagnie_avion ON public.plans_vol(compagnie_avion_id);

-- 10) Trigger pour déplacer l'avion après clôture du vol
CREATE OR REPLACE FUNCTION public.plans_vol_deplacer_avion()
RETURNS TRIGGER AS $$
BEGIN
  -- À la clôture, déplacer l'avion vers l'aéroport d'arrivée
  IF NEW.statut = 'cloture' AND OLD.statut != 'cloture' THEN
    IF NEW.compagnie_avion_id IS NOT NULL THEN
      UPDATE public.compagnie_avions
      SET aeroport_actuel = NEW.aeroport_arrivee, statut = 'ground'
      WHERE id = NEW.compagnie_avion_id;
    END IF;
    IF NEW.inventaire_avion_id IS NOT NULL THEN
      UPDATE public.inventaire_avions
      SET aeroport_actuel = NEW.aeroport_arrivee, statut = 'ground'
      WHERE id = NEW.inventaire_avion_id;
    END IF;
  END IF;
  
  -- Au décollage (accepté), mettre l'avion en vol
  IF NEW.statut IN ('accepte', 'en_cours', 'automonitoring') 
     AND OLD.statut NOT IN ('accepte', 'en_cours', 'automonitoring') THEN
    IF NEW.compagnie_avion_id IS NOT NULL THEN
      UPDATE public.compagnie_avions SET statut = 'in_flight' WHERE id = NEW.compagnie_avion_id;
    END IF;
    IF NEW.inventaire_avion_id IS NOT NULL THEN
      UPDATE public.inventaire_avions SET statut = 'in_flight' WHERE id = NEW.inventaire_avion_id;
    END IF;
  END IF;
  
  -- Si refusé, remettre au sol
  IF NEW.statut = 'refuse' AND OLD.statut != 'refuse' THEN
    IF NEW.compagnie_avion_id IS NOT NULL THEN
      UPDATE public.compagnie_avions SET statut = 'ground' WHERE id = NEW.compagnie_avion_id AND statut = 'in_flight';
    END IF;
    IF NEW.inventaire_avion_id IS NOT NULL THEN
      UPDATE public.inventaire_avions SET statut = 'ground' WHERE id = NEW.inventaire_avion_id AND statut = 'in_flight';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS plans_vol_deplacer_avion ON public.plans_vol;
CREATE TRIGGER plans_vol_deplacer_avion
  AFTER UPDATE ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.plans_vol_deplacer_avion();
