-- ===========================================
-- FIX: Problème de contrainte FK pour inventaire_avions
-- ===========================================

-- Supprimer l'ancienne contrainte (si elle existe)
ALTER TABLE public.plans_vol 
  DROP CONSTRAINT IF EXISTS plans_vol_inventaire_avion_id_fkey CASCADE;

-- Recréer la contrainte avec ON DELETE SET NULL pour éviter les erreurs
ALTER TABLE public.plans_vol 
  ADD CONSTRAINT plans_vol_inventaire_avion_id_fkey 
  FOREIGN KEY (inventaire_avion_id) 
  REFERENCES public.inventaire_avions(id) 
  ON DELETE SET NULL;

-- Vérifier que la table inventaire_avions a bien les bonnes colonnes
ALTER TABLE public.inventaire_avions 
  ADD COLUMN IF NOT EXISTS immatriculation TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS aeroport_actuel TEXT DEFAULT 'IRFD',
  ADD COLUMN IF NOT EXISTS usure_percent INTEGER DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'maintenance', 'bloque'));

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Contrainte inventaire_avions réparée';
END $$;
