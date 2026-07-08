-- Migration : ground_crew devient un accès additionnel booléen (comme atc et siavi)
-- au lieu d'un rôle principal exclusif.

-- 1. Ajouter la colonne booléenne ground_crew sur profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ground_crew BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrer les profils qui ont role = 'ground_crew' → pilote + ground_crew = true
UPDATE public.profiles
SET role = 'pilote', ground_crew = true
WHERE role = 'ground_crew';

-- 3. Supprimer 'ground_crew' de la contrainte CHECK sur role (si elle y est)
--    et s'assurer qu'instructeur est bien autorisé
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'instructeur', 'atc', 'siavi', 'ifsa'));
