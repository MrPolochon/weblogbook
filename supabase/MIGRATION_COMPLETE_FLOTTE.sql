-- ============================================================
-- MIGRATION COMPLETE : Flotte individuelle
-- Exécuter ce fichier SEUL - il fait tout
-- ============================================================

-- 1) SUPPRIMER et RECREER la table compagnie_avions proprement
DROP TABLE IF EXISTS public.compagnie_avions CASCADE;

CREATE TABLE public.compagnie_avions (
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

-- 2) Index
CREATE INDEX idx_compagnie_avions_compagnie ON public.compagnie_avions(compagnie_id);
CREATE INDEX idx_compagnie_avions_type ON public.compagnie_avions(type_avion_id);
CREATE INDEX idx_compagnie_avions_statut ON public.compagnie_avions(statut);
CREATE INDEX idx_compagnie_avions_aeroport ON public.compagnie_avions(aeroport_actuel);

-- 3) RLS
ALTER TABLE public.compagnie_avions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compagnie_avions_select" ON public.compagnie_avions 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "compagnie_avions_insert" ON public.compagnie_avions 
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

CREATE POLICY "compagnie_avions_update" ON public.compagnie_avions 
  FOR UPDATE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

CREATE POLICY "compagnie_avions_delete" ON public.compagnie_avions 
  FOR DELETE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compagnie_avions_updated_at ON public.compagnie_avions;
CREATE TRIGGER compagnie_avions_updated_at 
  BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Trigger blocage automatique à 0% usure
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

-- 6) Fonction pour générer immatriculation unique
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
    
    IF NOT EXISTS (SELECT 1 FROM public.compagnie_avions WHERE immatriculation = new_immat) THEN
      RETURN new_immat;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7) Ajouter colonne compagnie_avion_id à plans_vol si pas présente
ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_compagnie_avion ON public.plans_vol(compagnie_avion_id);

-- 7b) Ajouter colonne vol_ferry pour les vols à vide (déplacement d'avion)
ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS vol_ferry BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_plans_vol_ferry ON public.plans_vol(vol_ferry) WHERE vol_ferry = true;

COMMENT ON COLUMN public.plans_vol.vol_ferry IS 'Vol à vide pour déplacer un avion - pas de passagers/cargo, compagnie paie les taxes';

-- 8) Trigger pour déplacer l'avion après clôture du vol
CREATE OR REPLACE FUNCTION public.plans_vol_deplacer_avion()
RETURNS TRIGGER AS $$
BEGIN
  -- À la clôture, déplacer l'avion vers l'aéroport d'arrivée
  IF NEW.statut = 'cloture' AND OLD.statut != 'cloture' AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions
    SET aeroport_actuel = NEW.aeroport_arrivee, statut = 'ground'
    WHERE id = NEW.compagnie_avion_id;
  END IF;
  
  -- Au décollage (accepté), mettre l'avion en vol
  IF NEW.statut IN ('accepte', 'en_cours', 'automonitoring') 
     AND OLD.statut NOT IN ('accepte', 'en_cours', 'automonitoring') 
     AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions SET statut = 'in_flight' WHERE id = NEW.compagnie_avion_id;
  END IF;
  
  -- Si refusé, remettre au sol
  IF NEW.statut = 'refuse' AND OLD.statut != 'refuse' AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions SET statut = 'ground' WHERE id = NEW.compagnie_avion_id AND statut = 'in_flight';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS plans_vol_deplacer_avion ON public.plans_vol;
CREATE TRIGGER plans_vol_deplacer_avion
  AFTER UPDATE ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.plans_vol_deplacer_avion();

-- ============================================================
-- 9) CONVERTIR L'ANCIENNE FLOTTE
-- ============================================================

DO $$
DECLARE
  flotte_record RECORD;
  i INTEGER;
  new_immat TEXT;
  hub_code TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  j INTEGER;
  avions_crees INTEGER := 0;
BEGIN
  RAISE NOTICE '=== Début de la conversion de la flotte ===';
  
  -- Parcourir chaque entrée de l'ancienne flotte
  FOR flotte_record IN 
    SELECT 
      f.id,
      f.compagnie_id,
      f.type_avion_id,
      f.quantite,
      f.nom_personnalise,
      t.nom as type_nom,
      c.nom as compagnie_nom
    FROM public.compagnie_flotte f
    JOIN public.types_avion t ON t.id = f.type_avion_id
    JOIN public.compagnies c ON c.id = f.compagnie_id
  LOOP
    RAISE NOTICE 'Compagnie: % - Type: % - Quantité: %', 
      flotte_record.compagnie_nom, flotte_record.type_nom, flotte_record.quantite;
    
    -- Trouver le hub principal de la compagnie
    SELECT aeroport_code INTO hub_code
    FROM public.compagnie_hubs
    WHERE compagnie_id = flotte_record.compagnie_id
      AND est_hub_principal = true
    LIMIT 1;
    
    -- Si pas de hub, utiliser IRFD par défaut
    IF hub_code IS NULL THEN
      hub_code := 'IRFD';
    END IF;
    
    -- Créer autant d'avions individuels que la quantité
    FOR i IN 1..flotte_record.quantite LOOP
      -- Générer une immatriculation unique
      LOOP
        new_immat := 'F-';
        FOR j IN 1..4 LOOP
          new_immat := new_immat || substr(chars, floor(random() * 26 + 1)::int, 1);
        END LOOP;
        
        -- Vérifier unicité
        IF NOT EXISTS (SELECT 1 FROM public.compagnie_avions WHERE immatriculation = new_immat) THEN
          EXIT;
        END IF;
      END LOOP;
      
      -- Insérer l'avion individuel
      INSERT INTO public.compagnie_avions (
        compagnie_id,
        type_avion_id,
        immatriculation,
        nom_bapteme,
        aeroport_actuel,
        usure_percent,
        statut
      ) VALUES (
        flotte_record.compagnie_id,
        flotte_record.type_avion_id,
        new_immat,
        CASE WHEN flotte_record.quantite = 1 THEN flotte_record.nom_personnalise ELSE NULL END,
        hub_code,
        100,
        'ground'
      );
      
      avions_crees := avions_crees + 1;
      RAISE NOTICE '  -> Créé: % à %', new_immat, hub_code;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '=== Conversion terminée: % avions créés ===', avions_crees;
END $$;

-- 10) Afficher le résultat
SELECT 
  c.nom as compagnie,
  COUNT(*) as nb_avions,
  STRING_AGG(a.immatriculation, ', ' ORDER BY a.immatriculation) as immatriculations
FROM public.compagnie_avions a
JOIN public.compagnies c ON c.id = a.compagnie_id
GROUP BY c.nom
ORDER BY c.nom;
