BEGIN;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS logbook_processed_at timestamptz;
COMMENT ON COLUMN public.plans_vol.logbook_processed_at IS 'Plan traité dans le carnet (enregistré ou écarté), conservé pour l’historique administratif';
CREATE TABLE IF NOT EXISTS public.gate_assignment_releases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid NOT NULL,
 previous_row jsonb NOT NULL,reason text NOT NULL,released_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gate_assignment_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gate_assignment_releases FROM anon,authenticated;
GRANT ALL ON public.gate_assignment_releases TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_stale_gate_assignments(p_aeroport text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 WITH stale AS MATERIALIZED (
  SELECT a.id,to_jsonb(a) AS previous_row,
   CASE WHEN p.id IS NULL THEN 'missing_plan'
    WHEN p.statut NOT IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture') THEN 'inactive_plan'
    WHEN a.assignment_type='depart' AND p.statut NOT IN ('depose','en_attente','accepte') THEN 'departure_left_stand'
    ELSE 'expired' END AS reason
  FROM gate_assignments a LEFT JOIN plans_vol p ON p.id=a.plan_vol_id
  WHERE a.status IN ('reserved','occupied') AND (p_aeroport IS NULL OR a.aeroport=p_aeroport)
  AND (p.id IS NULL OR p.statut NOT IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture')
   OR (a.assignment_type='depart' AND p.statut NOT IN ('depose','en_attente','accepte'))
   OR coalesce(a.expires_at,a.assigned_at+interval '6 hours')<=now())
  FOR UPDATE OF a
 ), released AS (
  UPDATE gate_assignments a SET status='released' FROM stale s WHERE a.id=s.id
  RETURNING a.id,s.previous_row,s.reason
 )
 INSERT INTO gate_assignment_releases(assignment_id,previous_row,reason) SELECT id,previous_row,reason FROM released;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_stale_gate_assignments(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_gate_assignments(text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_gate_assignment_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s text; dep text; arr text;
BEGIN
 IF NEW.status NOT IN ('reserved','occupied') THEN RETURN NEW; END IF;
 SELECT statut,aeroport_depart,aeroport_arrivee INTO s,dep,arr FROM plans_vol WHERE id=NEW.plan_vol_id FOR UPDATE;
 IF NOT FOUND OR s NOT IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture') THEN
  RAISE EXCEPTION 'Ce vol est terminé ou inactif : attribution de porte impossible';
 END IF;
 IF (NEW.assignment_type='depart' AND (s NOT IN ('depose','en_attente','accepte') OR NEW.aeroport<>dep))
  OR (NEW.assignment_type='arrivee' AND NEW.aeroport<>arr) THEN
  RAISE EXCEPTION 'Attribution incompatible avec le trajet ou la phase du vol';
 END IF;
 NEW.expires_at:=coalesce(NEW.expires_at,NEW.assigned_at+interval '6 hours');
 IF NEW.expires_at<=now() THEN RAISE EXCEPTION 'Réservation de porte expirée'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_gate_assignment_plan ON public.gate_assignments;
CREATE TRIGGER guard_gate_assignment_plan BEFORE INSERT OR UPDATE ON public.gate_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_gate_assignment_plan();

CREATE OR REPLACE FUNCTION public.release_gates_on_plan_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.statut IS DISTINCT FROM OLD.statut THEN
  WITH previous AS MATERIALIZED (
   SELECT a.id,to_jsonb(a) AS snapshot FROM gate_assignments a
   WHERE a.plan_vol_id=NEW.id AND a.status IN ('reserved','occupied')
   AND (NEW.statut NOT IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture')
    OR (a.assignment_type='depart' AND NEW.statut NOT IN ('depose','en_attente','accepte')))
   FOR UPDATE OF a
  ), released AS (
   UPDATE gate_assignments a SET status='released' FROM previous p WHERE a.id=p.id
   RETURNING a.id,p.snapshot
  ) INSERT INTO gate_assignment_releases(assignment_id,previous_row,reason)
    SELECT id,snapshot,'plan_status_'||NEW.statut FROM released;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.release_gates_on_plan_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS release_gates_on_plan_status ON public.plans_vol;
CREATE TRIGGER release_gates_on_plan_status AFTER UPDATE OF statut ON public.plans_vol
FOR EACH ROW EXECUTE FUNCTION public.release_gates_on_plan_status();
SELECT public.cleanup_stale_gate_assignments(NULL) AS reservations_obsoletes_liberees;
NOTIFY pgrst, 'reload schema';
COMMIT;
