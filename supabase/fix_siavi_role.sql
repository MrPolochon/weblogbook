-- ============================================================
-- FIX: Ajouter 'siavi' au rôle profiles
-- ============================================================
-- Problème: Le code utilise role='siavi' mais la contrainte 
-- SQL limite à ('admin', 'pilote', 'atc', 'ifsa')
-- Solution: Ajouter 'siavi' à la contrainte (si la colonne existe)
-- ============================================================

DO $$
BEGIN
  -- Vérifier si la colonne 'role' existe
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'role'
  ) THEN
    -- Supprimer l'ancienne contrainte si elle existe
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    
    -- Ajouter la nouvelle contrainte avec 'siavi'
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa', 'siavi'));
    
    RAISE NOTICE '✅ Contrainte profiles_role mise à jour pour inclure siavi';
  ELSE
    RAISE NOTICE '⚠️ Colonne role n''existe pas dans profiles, skip de la migration';
    RAISE NOTICE 'ℹ️ Votre schéma de base de données semble différent du schéma attendu';
  END IF;
END $$;
