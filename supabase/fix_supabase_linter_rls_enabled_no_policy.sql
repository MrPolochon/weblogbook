-- ============================================================
-- INFO rls_enabled_no_policy (0008) : RLS activé sans politique
--
-- - instruction_*_training_requests : accès JWT comme les examens
-- - Autres tables : pas d’accès direct pour « authenticated » (service_role
--   contourne toujours le RLS sur Supabase).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) Training ATC / pilote (demandeur, assigné FI/FE, admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.instruction_atc_training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruction_pilot_training_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_atc_training_requests_select ON public.instruction_atc_training_requests;
CREATE POLICY instruction_atc_training_requests_select ON public.instruction_atc_training_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_atc_training_requests_insert ON public.instruction_atc_training_requests;
CREATE POLICY instruction_atc_training_requests_insert ON public.instruction_atc_training_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS instruction_atc_training_requests_update ON public.instruction_atc_training_requests;
CREATE POLICY instruction_atc_training_requests_update ON public.instruction_atc_training_requests
  FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_atc_training_requests_delete ON public.instruction_atc_training_requests;
CREATE POLICY instruction_atc_training_requests_delete ON public.instruction_atc_training_requests
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS instruction_pilot_training_requests_select ON public.instruction_pilot_training_requests;
CREATE POLICY instruction_pilot_training_requests_select ON public.instruction_pilot_training_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_pilot_training_requests_insert ON public.instruction_pilot_training_requests;
CREATE POLICY instruction_pilot_training_requests_insert ON public.instruction_pilot_training_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS instruction_pilot_training_requests_update ON public.instruction_pilot_training_requests;
CREATE POLICY instruction_pilot_training_requests_update ON public.instruction_pilot_training_requests
  FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_pilot_training_requests_delete ON public.instruction_pilot_training_requests;
CREATE POLICY instruction_pilot_training_requests_delete ON public.instruction_pilot_training_requests
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Tables surtout alimentées par le backend : bloquer le JWT « authenticated »
-- ---------------------------------------------------------------------------
ALTER TABLE public.aeroschool_formulaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeroschool_reponses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armee_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armee_missions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atis_broadcast_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atis_broadcast_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avions_disponibilite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avions_utilisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_beta_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_ingested_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aeroschool_formulaires_no_client ON public.aeroschool_formulaires;
CREATE POLICY aeroschool_formulaires_no_client ON public.aeroschool_formulaires
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS aeroschool_reponses_no_client ON public.aeroschool_reponses;
CREATE POLICY aeroschool_reponses_no_client ON public.aeroschool_reponses
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS armee_avions_no_client ON public.armee_avions;
CREATE POLICY armee_avions_no_client ON public.armee_avions
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS armee_missions_log_no_client ON public.armee_missions_log;
CREATE POLICY armee_missions_log_no_client ON public.armee_missions_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS atis_broadcast_config_no_client ON public.atis_broadcast_config;
CREATE POLICY atis_broadcast_config_no_client ON public.atis_broadcast_config
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS atis_broadcast_state_no_client ON public.atis_broadcast_state;
CREATE POLICY atis_broadcast_state_no_client ON public.atis_broadcast_state
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS avions_disponibilite_no_client ON public.avions_disponibilite;
CREATE POLICY avions_disponibilite_no_client ON public.avions_disponibilite
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS avions_utilisation_no_client ON public.avions_utilisation;
CREATE POLICY avions_utilisation_no_client ON public.avions_utilisation
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deletion_logs_no_client ON public.deletion_logs;
CREATE POLICY deletion_logs_no_client ON public.deletion_logs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS radar_api_tokens_no_client ON public.radar_api_tokens;
CREATE POLICY radar_api_tokens_no_client ON public.radar_api_tokens
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS radar_beta_requests_no_client ON public.radar_beta_requests;
CREATE POLICY radar_beta_requests_no_client ON public.radar_beta_requests
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS radar_ingested_positions_no_client ON public.radar_ingested_positions;
CREATE POLICY radar_ingested_positions_no_client ON public.radar_ingested_positions
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
