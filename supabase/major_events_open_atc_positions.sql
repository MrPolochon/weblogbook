-- Service ATC libre sur les positions sans réservation concurrente.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_reserved_atc_position()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  IF EXISTS (SELECT 1 FROM event_reservations WHERE role='atc' AND status='confirmed' AND airport=NEW.aeroport AND position=NEW.position
    AND starts_at<=now() AND ends_at>now() AND user_id<>NEW.user_id) THEN
    RAISE EXCEPTION 'Cette position est réservée à un autre contrôleur sur ce créneau';
  END IF;
  -- Une position non réservée peut être prise librement, même pendant un événement.
  RETURN NEW;
END $$;
COMMIT;
