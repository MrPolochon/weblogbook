-- ============================================================
-- MIGRATION : Intégration complète du rôle ground_crew
-- ============================================================
-- La colonne profiles.role utilise TEXT + CHECK constraint (pas un ENUM PG)
-- Cette migration met à jour la contrainte pour inclure 'ground_crew'.

-- 1. Supprimer la contrainte CHECK existante sur profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Ajouter la nouvelle contrainte incluant 'ground_crew'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'instructeur', 'atc', 'siavi', 'ifsa', 'ground_crew'));

-- 3. Tentative ENUM (sécurité : si jamais le type user_role existe en ENUM PG)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_role'
  ) THEN
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ground_crew';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- 4. Vérification : liste des comptes avec rôle ground_crew après migration
-- (exécuter manuellement si besoin de vérifier)
-- SELECT id, identifiant, role FROM profiles WHERE role = 'ground_crew';

-- ============================================================
-- RAPPEL : Tables ground_crew déjà créées dans add_ground_crew.sql
-- ============================================================
-- ground_sessions, airport_gates, gate_assignments,
-- ground_service_requests, boarding_status, company_gate_priority
-- Ces tables sont déjà créées — cette migration ne les recrée pas.
