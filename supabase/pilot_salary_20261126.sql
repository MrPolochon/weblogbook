-- Apply after flight_economy_20261030.sql, before deploying the application.
BEGIN;
ALTER TABLE public.compagnie_employes ADD COLUMN IF NOT EXISTS pourcentage_salaire integer
  CHECK (pourcentage_salaire BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.guard_pilot_salary() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF (TG_OP='INSERT' AND NEW.pourcentage_salaire IS NOT NULL)
       OR (TG_OP='UPDATE' AND NEW.pourcentage_salaire IS DISTINCT FROM OLD.pourcentage_salaire) THEN
      RAISE EXCEPTION 'Use the authorized company salary endpoint';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_pilot_salary ON public.compagnie_employes;
CREATE TRIGGER guard_pilot_salary BEFORE INSERT OR UPDATE ON public.compagnie_employes
FOR EACH ROW EXECUTE FUNCTION public.guard_pilot_salary();

-- Keep the existing pricing rules; override only the crew salary using the
-- authenticated actor passed by the server, never a client-supplied pilot id.
CREATE OR REPLACE FUNCTION public.flight_submission_pricing(p_scope jsonb, p_draw jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; pct integer;
BEGIN
  result := public.flight_submission_pricing(p_scope,p_draw);
  IF coalesce((p_scope->>'vol_commercial')::boolean,false) THEN
    SELECT pourcentage_salaire INTO pct FROM public.compagnie_employes
    WHERE compagnie_id=(p_scope->>'compagnie_id')::uuid AND pilote_id=p_actor;
    IF pct IS NOT NULL THEN
      result := result || jsonb_build_object('salaire_pilote',floor((result->>'revenue_brut')::numeric*pct/100));
    END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.flight_submission_pricing(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flight_submission_pricing(jsonb,jsonb,uuid) TO service_role;

-- Preserve installed integrity safeguards and cached quotes. Only new quotes
-- use the new rate; a quote already agreed with a pilot keeps its salary.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_flight_submission_quote_legacy(uuid,jsonb,jsonb)'::regprocedure) INTO definition;
  IF position('flight_submission_pricing(p_scope,p_candidate,p_actor)' IN definition)=0 THEN
    IF position('flight_submission_pricing(p_scope,p_candidate)' IN definition)=0
       OR position('flight_submission_pricing(q.scope,q.draw)' IN definition)=0 THEN
      RAISE EXCEPTION 'Unexpected quote function; salary migration requires review';
    END IF;
    definition := replace(definition,'flight_submission_pricing(p_scope,p_candidate)','flight_submission_pricing(p_scope,p_candidate,p_actor)');
    definition := replace(definition,'flight_submission_pricing(q.scope,q.draw)','flight_submission_pricing(q.scope,q.draw,p_actor)');
    EXECUTE definition;
  END IF;
END $$;
COMMIT;
