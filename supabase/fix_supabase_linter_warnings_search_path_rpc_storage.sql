-- ============================================================
-- Réduit les WARN du linter Supabase (lot 2) :
--   0011 function_search_path_mutable
--   0028 / 0029 anon + authenticated sur RPC SECURITY DEFINER
--   0025 public_bucket_allows_listing (cartes-identite)
--   0024 rls_policy_always_true (activity_logs + aeroschool_responses si tables connues)
--
-- Non couvert ici (à traiter au cas par cas ou hors SQL) :
--   0024 autres tables : voir supabase/fix_supabase_linter_permissive_rls_policies.sql
--   auth_leaked_password_protection : Auth → Password → activer HaveIBeenPwned dans le dashboard
--
-- Prérequis : rôles anon, authenticated, service_role ; public.is_admin().
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) search_path figé sur toutes les fonctions normales du schéma public
--    (évite l’attaque par schéma malveillant + satisfait le linter)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS c WHERE c::text LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', r.fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) RPC SECURITY DEFINER : retirer l’exécution anon / public ; réservé au
--    service_role (c’est ainsi que les routes Next appellent la base).
--    is_admin / is_pdg : garder EXECUTE pour authenticated (politiques RLS).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'alliance_creer',
        'alliance_quitter',
        'consommer_cargo',
        'consommer_passagers_aeroport',
        'create_company_felitz_account',
        'create_company_felitz_account_after',
        'create_company_felitz_fn',
        'create_personal_felitz_account',
        'crediter_compte_safe',
        'debiter_compte_safe',
        'felitz_toutes_transactions_admin',
        'handle_atc_session_insert',
        'ifsa_enquetes_create',
        'ifsa_signalements_create',
        'livrer_cargo',
        'pay_siavi_intervention',
        'pay_siavi_taxes',
        'plans_vol_deplacer_avion',
        'plans_vol_insert_avion',
        'plans_vol_update_avion',
        'plans_vol_update_avion_location',
        'regenerer_cargo_aeroport',
        'regenerer_passagers_aeroport',
        'set_company_vban_fn',
        'update_siavi_temps_total'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.fn);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.fn);
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.fn);
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN ('is_admin', 'is_pdg')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.fn);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.fn);
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;

-- Autres fonctions SECURITY DEFINER du projet non listées ci‑dessus : elles
-- reçoivent aussi search_path via la boucle §1. Pour l’EXECUTE, exécuter à
-- nouveau un lint : si de nouveaux noms apparaissent, ajoutez-les au bloc §2.

-- ---------------------------------------------------------------------------
-- 3) Storage : bucket public — supprimer le SELECT trop large (le linter
--    indique que le listing n’est pas nécessaire pour les URLs publiques).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "cartes_storage_select" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 4) RLS : journal d’activité — INSERT réservé aux comptes admin si accès JWT
--    (les insertions via service_role contournent toujours le RLS).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_logs_insert_all" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_service_insert" ON public.activity_logs;

CREATE POLICY "activity_logs_insert_admin"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5) AeroSchool : INSERT public trop permissif — les soumissions passent par
--    l’API (service_role). Aucun INSERT direct avec un JWT utilisateur requis.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'aeroschool_responses'
  ) THEN
    DROP POLICY IF EXISTS "aeroschool_responses_public_insert" ON public.aeroschool_responses;
    DROP POLICY IF EXISTS "aeroschool_responses_insert_own" ON public.aeroschool_responses;
    DROP POLICY IF EXISTS "aeroschool_responses_insert_service_only" ON public.aeroschool_responses;
    CREATE POLICY "aeroschool_responses_insert_service_only"
      ON public.aeroschool_responses FOR INSERT TO authenticated
      WITH CHECK (false);
  END IF;
END $$;
