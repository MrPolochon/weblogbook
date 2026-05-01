-- ============================================================
-- Corrige les alertes Supabase Database Linter (sécurité) :
-- 0007 policy_exists_rls_disabled
-- 0010 security_definer_view
-- 0013 rls_disabled_in_public
--
-- À exécuter une fois sur le projet Supabase (SQL Editor).
-- Prérequis : fonction public.is_admin() (déjà présente dans la plupart des déploiements).
-- Le rôle service_role contourne le RLS : les routes API utilisant la clé service ne sont pas impactées.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) RLS : tables listées par le linter — activation + politiques minimales
-- ---------------------------------------------------------------------------

-- compagnie_locations : politiques souvent déjà présentes (noms locations_*)
ALTER TABLE public.compagnie_locations ENABLE ROW LEVEL SECURITY;

-- instruction : accès côté JWT authentifié aligné sur l’usage (élève, instructeur référent, admin)
ALTER TABLE public.instruction_progression_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_progression_items_select ON public.instruction_progression_items;
CREATE POLICY instruction_progression_items_select ON public.instruction_progression_items
  FOR SELECT TO authenticated
  USING (
    eleve_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = instruction_progression_items.eleve_id
        AND p.instructeur_referent_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_progression_items_insert ON public.instruction_progression_items;
CREATE POLICY instruction_progression_items_insert ON public.instruction_progression_items
  FOR INSERT TO authenticated
  WITH CHECK (
    eleve_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = eleve_id
        AND p.instructeur_referent_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_progression_items_update ON public.instruction_progression_items;
CREATE POLICY instruction_progression_items_update ON public.instruction_progression_items
  FOR UPDATE TO authenticated
  USING (
    eleve_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = instruction_progression_items.eleve_id
        AND p.instructeur_referent_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    eleve_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = eleve_id
        AND p.instructeur_referent_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_progression_items_delete ON public.instruction_progression_items;
CREATE POLICY instruction_progression_items_delete ON public.instruction_progression_items
  FOR DELETE TO authenticated
  USING (public.is_admin());

ALTER TABLE public.instruction_exam_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_exam_requests_select ON public.instruction_exam_requests;
CREATE POLICY instruction_exam_requests_select ON public.instruction_exam_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR instructeur_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_exam_requests_insert ON public.instruction_exam_requests;
CREATE POLICY instruction_exam_requests_insert ON public.instruction_exam_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS instruction_exam_requests_update ON public.instruction_exam_requests;
CREATE POLICY instruction_exam_requests_update ON public.instruction_exam_requests
  FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR instructeur_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR instructeur_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_exam_requests_delete ON public.instruction_exam_requests;
CREATE POLICY instruction_exam_requests_delete ON public.instruction_exam_requests
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

-- SID/STAR : lecture pour tout utilisateur authentifié ; écriture réservée aux admins (si accès via JWT, pas service_role)
ALTER TABLE public.sid_star ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sid_star_select_all ON public.sid_star;
CREATE POLICY sid_star_select_all ON public.sid_star
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sid_star_write_admin ON public.sid_star;
CREATE POLICY sid_star_write_admin ON public.sid_star
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sid_star_update_admin ON public.sid_star;
CREATE POLICY sid_star_update_admin ON public.sid_star
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sid_star_delete_admin ON public.sid_star;
CREATE POLICY sid_star_delete_admin ON public.sid_star
  FOR DELETE TO authenticated USING (public.is_admin());

ALTER TABLE public.sid_star_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sid_star_procedures_select_all ON public.sid_star_procedures;
CREATE POLICY sid_star_procedures_select_all ON public.sid_star_procedures
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sid_star_procedures_write_admin ON public.sid_star_procedures;
CREATE POLICY sid_star_procedures_write_admin ON public.sid_star_procedures
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Tables principalement servies par la clé service_role : RLS actif, aucune politique pour authenticated = pas d’accès direct client
ALTER TABLE public.armee_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armee_missions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_beta_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_ingested_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atis_broadcast_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atis_broadcast_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeroschool_formulaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeroschool_reponses ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Vues SECURITY DEFINER → SECURITY INVOKER (PG 15+, recommandé par Supabase)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  vname text;
BEGIN
  FOREACH vname IN ARRAY ARRAY[
    'plans_vol_urgence',
    'v_admin_actions',
    'v_admin_actions_avec_compte',
    'v_felitz_transactions_avec_compte'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = vname
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', vname);
      RAISE NOTICE 'Vue % : security_invoker = true', vname;
    ELSE
      RAISE NOTICE 'Vue % absente, ignorée', vname;
    END IF;
  END LOOP;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'ALTER VIEW security_invoker non supporté (Postgres < 15 ?). Mettre à jour Postgres ou recréer les vues.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Vues security_invoker : %', SQLERRM;
END $$;
