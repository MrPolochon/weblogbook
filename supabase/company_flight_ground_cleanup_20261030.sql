-- Keep ground service lifecycle coupled to the durable flight transition.
-- No historical balances or completed services are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.cleanup_ground_requests_after_flight() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Legacy closures first write a provisional terminal status, then perform
 -- their separate payment. Their JS cleanup already runs after success only.
 IF NEW.statut IS DISTINCT FROM OLD.statut AND (NEW.statut IN ('annule','refuse') OR NEW.economy_version=2 AND NEW.statut IN ('cloture','en_pause')) THEN
   UPDATE ground_service_requests SET statut='rejected' WHERE plan_vol_id=NEW.id AND statut IN ('pending','accepted','in_progress');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cleanup_ground_requests_after_flight ON public.plans_vol;
CREATE TRIGGER cleanup_ground_requests_after_flight AFTER UPDATE OF statut ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.cleanup_ground_requests_after_flight();

CREATE OR REPLACE FUNCTION public.guard_ground_request_open_flight() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE state text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.plan_vol_id IS DISTINCT FROM OLD.plan_vol_id THEN RAISE EXCEPTION 'Le plan du service au sol est immuable'; END IF;
 IF NEW.statut NOT IN ('pending','accepted','in_progress','completed') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.statut IS NOT DISTINCT FROM OLD.statut THEN RETURN NEW; END IF;
 SELECT statut INTO state FROM plans_vol WHERE id=NEW.plan_vol_id FOR UPDATE;
 IF NOT FOUND OR state IN ('cloture','annule','refuse','en_pause','planifie_suivant') THEN RAISE EXCEPTION 'Ce vol est terminé ou indisponible ; aucun service au sol ne peut être créé ou terminé' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_ground_request_open_flight ON public.ground_service_requests;
CREATE TRIGGER guard_ground_request_open_flight BEFORE INSERT OR UPDATE OF statut,plan_vol_id ON public.ground_service_requests FOR EACH ROW EXECUTE FUNCTION public.guard_ground_request_open_flight();

-- Lock the plan BEFORE the request, in the same order as flight settlement.
-- A concurrent closure either rejects this completion or sees it already done.
CREATE OR REPLACE FUNCTION public.complete_flight_ground_service(p_actor uuid,p_request uuid,p_expected text,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request ground_service_requests%ROWTYPE; plan_state text; pilot_profile jsonb; score numeric; amount numeric;
BEGIN
 SELECT to_jsonb(p) INTO pilot_profile FROM profiles p WHERE id=p_actor;
 IF pilot_profile IS NULL OR NOT (pilot_profile->>'role'='admin' OR coalesce((pilot_profile->>'ground_crew')::boolean,false)) THEN RAISE EXCEPTION 'Accès Ground Crew requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO request FROM ground_service_requests WHERE id=p_request;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT statut INTO plan_state FROM plans_vol WHERE id=request.plan_vol_id FOR UPDATE;
 IF NOT FOUND OR plan_state IN ('cloture','annule','refuse','en_pause','planifie_suivant') THEN RAISE EXCEPTION 'Le vol vient de se terminer. Le service ne peut plus être complété' USING ERRCODE='23514'; END IF;
 IF p_expected NOT IN ('accepted','in_progress') OR p_result->>'statut' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'Transition de service invalide' USING ERRCODE='23514'; END IF;
 score:=(p_result->>'score_minijeu')::numeric; amount:=(p_result->>'montant_paye')::numeric;
 IF score IS NULL OR score NOT BETWEEN 0 AND 1 OR amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Résultat de service invalide' USING ERRCODE='23514'; END IF;
 UPDATE ground_service_requests SET statut='completed',completed_at=now(),completed_by=p_actor,score_minijeu=score,montant_paye=amount,
   notes=CASE WHEN p_result ? 'notes' THEN p_result->>'notes' ELSE notes END,
   pilote_confirme=CASE WHEN p_result ? 'pilote_confirme' AND pilote_id=p_actor THEN (p_result->>'pilote_confirme')::boolean ELSE pilote_confirme END
 WHERE id=p_request AND statut=p_expected RETURNING * INTO request;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(request);
END $$;
REVOKE ALL ON FUNCTION public.cleanup_ground_requests_after_flight(),public.guard_ground_request_open_flight(),public.complete_flight_ground_service(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_flight_ground_service(uuid,uuid,text,jsonb) TO service_role;
COMMIT;
