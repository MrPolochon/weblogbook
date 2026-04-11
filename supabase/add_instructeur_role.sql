-- Ajouter le rôle "instructeur" dans la contrainte des profils
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'pilote', 'instructeur', 'atc', 'siavi', 'ifsa'));
    RAISE NOTICE '✅ Contrainte role mise à jour avec instructeur';
  END IF;
END $$;
