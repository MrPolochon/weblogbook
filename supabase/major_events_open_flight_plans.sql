-- Dépôt libre pendant les événements majeurs ; conserver la liaison des réservations existantes.
BEGIN;
CREATE OR REPLACE FUNCTION public.check_major_event_flight(p_pilot UUID,p_depart TEXT,p_arrival TEXT,p_depart_at TIMESTAMPTZ,p_duration INTEGER,p_callsign TEXT,p_plan UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev RECORD; booking public.event_reservations%ROWTYPE; ids UUID[] := '{}'; label TEXT; slot_time TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  FOR ev IN SELECT c.*,e.title,e.starts_at,e.ends_at FROM major_event_configs c JOIN site_calendar_events e ON e.id=c.event_id
    WHERE c.enabled AND (p_depart=ANY(c.airports) OR p_arrival=ANY(c.airports)) AND
      ((now() >= e.starts_at AND now() < e.ends_at) OR
       (p_depart=ANY(c.airports) AND p_depart_at >= e.starts_at AND p_depart_at < e.ends_at) OR
       (p_arrival=ANY(c.airports) AND p_depart_at + make_interval(mins => p_duration) >= e.starts_at AND p_depart_at + make_interval(mins => p_duration) < e.ends_at))
    ORDER BY c.event_id LOOP
    SELECT * INTO booking FROM event_reservations r WHERE r.event_id=ev.event_id AND r.user_id=p_pilot AND r.role='pilot' AND r.status='confirmed'
      AND r.departure=p_depart AND r.arrival=p_arrival AND upper(r.callsign)=upper(trim(p_callsign))
      AND p_depart_at >= r.departure_at AND p_depart_at < r.departure_at + make_interval(mins => ev.slot_minutes)
      AND p_duration=r.duration_minutes AND (r.claimed_at IS NULL OR r.plan_id=p_plan)
      ORDER BY r.created_at LIMIT 1 FOR UPDATE;
    -- Les slots pilotes organisent le manifeste sans bloquer les autres vols ou strips manuels.
    IF NOT FOUND THEN CONTINUE; END IF;
    ids := array_append(ids,booking.id); label := coalesce(label || ' / ','') || ev.title; slot_time := coalesce(slot_time,booking.starts_at);
  END LOOP;
  RETURN jsonb_build_object('ids',to_jsonb(ids),'title',label,'slot_time',slot_time);
END $$;
COMMIT;
