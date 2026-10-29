-- Apply after logbook_staff_validation and flight_submission_integrity.
-- Flight writes use the checked server APIs, including legacy/manual/military plans.
-- SELECT policies and realtime subscriptions are unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_flight_plan_server_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.logbook_is_privileged_writer() THEN
    RAISE EXCEPTION 'Utilisez les commandes du site pour déposer ou modifier un plan de vol.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_flight_plan_server_writes ON public.plans_vol;
CREATE TRIGGER guard_flight_plan_server_writes BEFORE INSERT OR UPDATE OR DELETE ON public.plans_vol
FOR EACH ROW EXECUTE FUNCTION public.guard_flight_plan_server_writes();
REVOKE ALL ON FUNCTION public.guard_flight_plan_server_writes() FROM PUBLIC,anon,authenticated;

-- Older stock functions must not offer a second public consumption path.
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('consommer_passagers_aeroport','consommer_cargo')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
