-- ============================================================
-- LIER PLANS DE VOL AUX AVIONS INDIVIDUELS
-- Permet de valider la localisation et le statut des avions
-- ============================================================

-- 1) Ajouter la référence à compagnie_avions dans plans_vol
ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;

-- 2) Index pour performance
CREATE INDEX IF NOT EXISTS idx_plans_vol_compagnie_avion ON public.plans_vol(compagnie_avion_id);

-- 3) Fonction pour mettre à jour la localisation de l'avion après clôture
CREATE OR REPLACE FUNCTION public.plans_vol_update_avion_location()
RETURNS TRIGGER AS $$
BEGIN
  -- Quand un plan de vol passe à 'cloture', déplacer l'avion à l'aéroport d'arrivée
  IF NEW.statut = 'cloture' AND OLD.statut != 'cloture' AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions
    SET aeroport_actuel = NEW.aeroport_arrivee,
        statut = 'ground'
    WHERE id = NEW.compagnie_avion_id;
  END IF;
  
  -- Quand un plan de vol passe à 'accepte' ou 'en_cours', mettre l'avion en vol
  IF (NEW.statut IN ('accepte', 'en_cours', 'automonitoring')) 
     AND OLD.statut NOT IN ('accepte', 'en_cours', 'automonitoring') 
     AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions
    SET statut = 'in_flight'
    WHERE id = NEW.compagnie_avion_id AND statut = 'ground';
  END IF;
  
  -- Quand un plan de vol est refusé, remettre l'avion au sol
  IF NEW.statut = 'refuse' AND OLD.statut != 'refuse' AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions
    SET statut = 'ground'
    WHERE id = NEW.compagnie_avion_id AND statut = 'in_flight';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS plans_vol_update_avion_location ON public.plans_vol;
CREATE TRIGGER plans_vol_update_avion_location
  AFTER UPDATE ON public.plans_vol
  FOR EACH ROW
  EXECUTE FUNCTION public.plans_vol_update_avion_location();

-- 4) Commentaires
COMMENT ON COLUMN public.plans_vol.compagnie_avion_id IS 'Référence à un avion individuel de la flotte (optionnel)';
