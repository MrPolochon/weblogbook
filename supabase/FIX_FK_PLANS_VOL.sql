-- ============================================================
-- FIX COMPLET : Système avions individuels + vols ferry
-- Exécuter ce script pour réparer toutes les erreurs
-- ============================================================

-- ============================================================
-- DIAGNOSTIC D'ABORD
-- ============================================================

-- Vérifier que la table compagnie_avions existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compagnie_avions') THEN
    RAISE EXCEPTION 'Table compagnie_avions n''existe pas! Exécutez MIGRATION_COMPLETE_FLOTTE.sql d''abord.';
  END IF;
END $$;

-- ============================================================
-- 1) RÉPARER compagnie_avion_id DANS plans_vol
-- ============================================================

-- Supprimer l'ancienne colonne (les refs aux anciens IDs sont invalides de toute façon)
ALTER TABLE public.plans_vol DROP COLUMN IF EXISTS compagnie_avion_id;

-- Recréer avec la bonne FK
ALTER TABLE public.plans_vol 
  ADD COLUMN compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_plans_vol_compagnie_avion ON public.plans_vol(compagnie_avion_id);

-- ============================================================
-- 2) AJOUTER vol_ferry
-- ============================================================

ALTER TABLE public.plans_vol 
  ADD COLUMN IF NOT EXISTS vol_ferry BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_plans_vol_ferry ON public.plans_vol(vol_ferry) WHERE vol_ferry = true;

COMMENT ON COLUMN public.plans_vol.vol_ferry IS 'Vol à vide pour déplacer un avion - pas de passagers/cargo';

-- ============================================================
-- 3) VÉRIFIER LE SCHÉMA compagnie_avions
-- ============================================================

-- S'assurer que toutes les colonnes existent
DO $$
BEGIN
  -- Vérifier immatriculation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compagnie_avions' AND column_name = 'immatriculation') THEN
    RAISE EXCEPTION 'Colonne immatriculation manquante dans compagnie_avions!';
  END IF;
  
  -- Vérifier aeroport_actuel
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compagnie_avions' AND column_name = 'aeroport_actuel') THEN
    RAISE EXCEPTION 'Colonne aeroport_actuel manquante dans compagnie_avions!';
  END IF;
  
  -- Vérifier statut
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compagnie_avions' AND column_name = 'statut') THEN
    RAISE EXCEPTION 'Colonne statut manquante dans compagnie_avions!';
  END IF;
  
  -- Vérifier usure_percent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compagnie_avions' AND column_name = 'usure_percent') THEN
    RAISE EXCEPTION 'Colonne usure_percent manquante dans compagnie_avions!';
  END IF;
  
  RAISE NOTICE 'Schema compagnie_avions OK!';
END $$;

-- ============================================================
-- 4) TRIGGERS POUR GÉRER LE STATUT DE L'AVION
-- ============================================================

-- Trigger UPDATE : quand le statut du plan de vol change
CREATE OR REPLACE FUNCTION public.plans_vol_update_avion()
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
  
  -- Si refusé ou annulé, remettre au sol
  IF NEW.statut IN ('refuse', 'annule') AND OLD.statut NOT IN ('refuse', 'annule', 'cloture') AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions SET statut = 'ground' WHERE id = NEW.compagnie_avion_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger INSERT : quand un plan de vol est créé directement avec statut accepte (vol sans ATC)
CREATE OR REPLACE FUNCTION public.plans_vol_insert_avion()
RETURNS TRIGGER AS $$
BEGIN
  -- Si créé directement en statut accepté/en_cours, mettre l'avion en vol
  IF NEW.statut IN ('accepte', 'en_cours', 'automonitoring') AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE public.compagnie_avions SET statut = 'in_flight' WHERE id = NEW.compagnie_avion_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer les anciens triggers
DROP TRIGGER IF EXISTS plans_vol_deplacer_avion ON public.plans_vol;
DROP TRIGGER IF EXISTS plans_vol_update_avion ON public.plans_vol;
DROP TRIGGER IF EXISTS plans_vol_insert_avion ON public.plans_vol;

-- Créer les nouveaux triggers
CREATE TRIGGER plans_vol_update_avion
  AFTER UPDATE ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.plans_vol_update_avion();

CREATE TRIGGER plans_vol_insert_avion
  AFTER INSERT ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.plans_vol_insert_avion();

-- ============================================================
-- 5) VÉRIFICATION FINALE
-- ============================================================

-- Afficher les avions disponibles
SELECT 
  a.id,
  a.immatriculation,
  a.aeroport_actuel,
  a.statut,
  a.usure_percent,
  c.nom as compagnie,
  t.nom as type_avion
FROM public.compagnie_avions a
JOIN public.compagnies c ON c.id = a.compagnie_id
JOIN public.types_avion t ON t.id = a.type_avion_id
ORDER BY c.nom, a.immatriculation;

-- Afficher le résumé
SELECT 
  'compagnie_avions' as table_name,
  COUNT(*) as count
FROM public.compagnie_avions
UNION ALL
SELECT 
  'plans_vol avec avion individuel' as table_name,
  COUNT(*) as count
FROM public.plans_vol
WHERE compagnie_avion_id IS NOT NULL;

-- Message final
DO $$ BEGIN RAISE NOTICE '✅ Fix terminé avec succès!'; END $$;
