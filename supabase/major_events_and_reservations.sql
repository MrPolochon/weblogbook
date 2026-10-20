-- Événements majeurs et planning unique de réservations. Réexécutable.
BEGIN;
CREATE TABLE IF NOT EXISTS public.major_event_configs (
  event_id UUID PRIMARY KEY REFERENCES public.site_calendar_events(id) ON DELETE RESTRICT,
  airports TEXT[] NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 10 CHECK (slot_minutes BETWEEN 5 AND 60),
  pilot_capacity INTEGER NOT NULL DEFAULT 5 CHECK (pilot_capacity BETWEEN 1 AND 100),
  atc_positions TEXT[] NOT NULL DEFAULT ARRAY['Delivery','Clairance','Ground','Tower','APP','DEP','Center'],
  enabled BOOLEAN NOT NULL DEFAULT true,
  bookings_open BOOLEAN NOT NULL DEFAULT true,
  CHECK (cardinality(airports) BETWEEN 1 AND 30)
);
CREATE TABLE IF NOT EXISTS public.event_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.major_event_configs(event_id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('pilot', 'atc')),
  airport TEXT NOT NULL,
  position TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  movement TEXT CHECK (movement IN ('departure', 'arrival')),
  departure TEXT,
  arrival TEXT,
  departure_at TIMESTAMPTZ,
  duration_minutes INTEGER CHECK (duration_minutes BETWEEN 1 AND 1440),
  callsign TEXT,
  airline TEXT,
  aircraft TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waitlisted', 'cancelled', 'no_show')),
  ready_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  plan_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((role = 'atc' AND position IS NOT NULL) OR (role = 'pilot' AND event_id IS NOT NULL AND departure IS NOT NULL AND arrival IS NOT NULL AND departure_at IS NOT NULL AND duration_minutes IS NOT NULL AND callsign IS NOT NULL)),
  CHECK (length(coalesce(callsign, '')) <= 30 AND length(coalesce(airline, '')) <= 100 AND length(coalesce(aircraft, '')) <= 100)
);
CREATE INDEX IF NOT EXISTS event_reservations_event ON public.event_reservations(event_id, starts_at);
CREATE INDEX IF NOT EXISTS event_reservations_owner ON public.event_reservations(user_id, starts_at);
CREATE INDEX IF NOT EXISTS event_reservations_atc ON public.event_reservations(airport, position, starts_at, ends_at) WHERE role = 'atc' AND status = 'confirmed';
ALTER TABLE public.major_event_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.major_event_configs, public.event_reservations FROM anon, authenticated;
GRANT ALL ON public.major_event_configs, public.event_reservations TO service_role;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS event_booking_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_title TEXT,
  ADD COLUMN IF NOT EXISTS event_slot_time TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.guard_event_reservation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.major_event_configs%ROWTYPE; e public.site_calendar_events%ROWTYPE;
  ap TEXT; movement_at TIMESTAMPTZ; bucket_start TIMESTAMPTZ; qty INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  IF TG_OP = 'UPDATE' AND OLD.claimed_at IS NOT NULL AND
    (NEW.status IS DISTINCT FROM OLD.status OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.departure IS DISTINCT FROM OLD.departure
      OR NEW.arrival IS DISTINCT FROM OLD.arrival OR NEW.callsign IS DISTINCT FROM OLD.callsign) THEN
    RAISE EXCEPTION 'Cette réservation est déjà utilisée par un plan de vol';
  END IF;
  IF NEW.status NOT IN ('confirmed', 'waitlisted') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['ready_at','claimed_at','plan_id']) =
    (to_jsonb(OLD)-ARRAY['ready_at','claimed_at','plan_id']) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND (blocked_until IS NULL OR blocked_until <= now())) THEN
    RAISE EXCEPTION 'Compte suspendu ou introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM discord_links WHERE user_id = NEW.user_id AND discord_user_id IS NOT NULL
    AND coalesce(status, '') NOT IN ('temporary_block','permanent_block')) THEN
    RAISE EXCEPTION 'Liez votre compte Discord avant de réserver';
  END IF;
  IF NEW.ends_at <= now() OR NEW.ends_at - NEW.starts_at > interval '24 hours' THEN RAISE EXCEPTION 'Créneau passé ou durée supérieure à 24 heures'; END IF;
  IF NEW.event_id IS NOT NULL THEN
    SELECT * INTO c FROM major_event_configs WHERE event_id = NEW.event_id FOR UPDATE;
    SELECT * INTO e FROM site_calendar_events WHERE id = NEW.event_id;
    IF NOT c.enabled OR NOT c.bookings_open OR e.ends_at IS NULL OR e.ends_at <= now() THEN RAISE EXCEPTION 'Réservations fermées'; END IF;
    IF NOT (NEW.airport = ANY(c.airports)) OR NEW.starts_at < e.starts_at OR NEW.ends_at > e.ends_at THEN RAISE EXCEPTION 'Créneau en dehors de l’événement ou aéroport non concerné'; END IF;
    IF NEW.role = 'pilot' THEN
      IF NEW.ends_at <> NEW.starts_at + make_interval(mins => c.slot_minutes)
        OR mod(extract(epoch FROM (NEW.starts_at - e.starts_at))::numeric, c.slot_minutes * 60) <> 0 THEN RAISE EXCEPTION 'Sélectionnez un slot du calendrier'; END IF;
      IF NEW.movement = 'departure' AND (NEW.departure <> NEW.airport OR NEW.departure_at <> NEW.starts_at)
        OR NEW.movement = 'arrival' AND (NEW.arrival <> NEW.airport OR NEW.departure_at + make_interval(mins => NEW.duration_minutes) <> NEW.starts_at)
        OR NEW.movement IS NULL OR length(trim(NEW.callsign)) < 1 OR length(trim(coalesce(NEW.aircraft, ''))) < 1 THEN
        RAISE EXCEPTION 'Route, appareil ou horaire incohérent avec le slot';
      END IF;
    ELSIF NOT (NEW.position = ANY(c.atc_positions)) THEN RAISE EXCEPTION 'Poste non ouvert pour cet événement'; END IF;
  ELSIF NEW.role <> 'atc' THEN RAISE EXCEPTION 'Les slots pilotes sont réservés aux événements'; END IF;
  IF NEW.status = 'waitlisted' THEN
    IF NEW.role <> 'pilot' THEN RAISE EXCEPTION 'La liste d’attente concerne les pilotes'; END IF;
    IF EXISTS (SELECT 1 FROM event_reservations WHERE user_id = NEW.user_id AND event_id = NEW.event_id
      AND starts_at = NEW.starts_at AND status IN ('confirmed','waitlisted') AND id <> NEW.id) THEN RAISE EXCEPTION 'Vous avez déjà réservé ce créneau'; END IF;
    RETURN NEW;
  END IF;
  -- Une réservation libre et une réservation événement utilisent exactement le même verrou et le même planning.
  IF EXISTS (SELECT 1 FROM event_reservations r WHERE r.id <> NEW.id AND r.status = 'confirmed' AND (
    (r.user_id = NEW.user_id AND
      tstzrange(CASE WHEN r.role='pilot' THEN r.departure_at ELSE r.starts_at END, CASE WHEN r.role='pilot' THEN r.departure_at+make_interval(mins=>r.duration_minutes) ELSE r.ends_at END,'[)') &&
      tstzrange(CASE WHEN NEW.role='pilot' THEN NEW.departure_at ELSE NEW.starts_at END, CASE WHEN NEW.role='pilot' THEN NEW.departure_at+make_interval(mins=>NEW.duration_minutes) ELSE NEW.ends_at END,'[)')
      AND NOT (r.role='pilot' AND NEW.role='pilot' AND r.event_id<>NEW.event_id AND r.departure=NEW.departure AND r.arrival=NEW.arrival AND r.departure_at=NEW.departure_at AND r.duration_minutes=NEW.duration_minutes AND r.callsign=NEW.callsign))
    OR (NEW.role='atc' AND r.role='atc' AND r.airport=NEW.airport AND r.position=NEW.position AND tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(NEW.starts_at,NEW.ends_at,'[)')))) THEN
    RAISE EXCEPTION 'Ce créneau ou cette position est déjà réservé : la réservation existante est conservée' USING ERRCODE = '23P01';
  END IF;
  IF NEW.role = 'atc' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND (atc = true OR role IN ('atc','admin'))) THEN RAISE EXCEPTION 'Habilitation ATC requise'; END IF;
    IF NEW.starts_at <= now() AND EXISTS (SELECT 1 FROM atc_sessions WHERE aeroport = NEW.airport AND position = NEW.position AND user_id <> NEW.user_id) THEN
      RAISE EXCEPTION 'Cette position est actuellement en service';
    END IF;
  ELSE
    FOREACH ap IN ARRAY c.airports LOOP
      FOR movement_at IN SELECT NEW.departure_at WHERE NEW.departure = ap UNION ALL
        SELECT NEW.departure_at + make_interval(mins => NEW.duration_minutes) WHERE NEW.arrival = ap LOOP
        IF movement_at < e.starts_at OR movement_at >= e.ends_at THEN CONTINUE; END IF;
        bucket_start := e.starts_at + floor(extract(epoch FROM (movement_at - e.starts_at)) / (c.slot_minutes * 60)) * make_interval(mins => c.slot_minutes);
        SELECT coalesce(sum(
          CASE WHEN r.departure=ap AND r.departure_at>=bucket_start AND r.departure_at<bucket_start+make_interval(mins=>c.slot_minutes) THEN 1 ELSE 0 END +
          CASE WHEN r.arrival=ap AND r.departure_at+make_interval(mins=>r.duration_minutes)>=bucket_start AND r.departure_at+make_interval(mins=>r.duration_minutes)<bucket_start+make_interval(mins=>c.slot_minutes) THEN 1 ELSE 0 END),0)
          INTO qty FROM event_reservations r WHERE r.id<>NEW.id AND r.event_id=NEW.event_id AND r.role='pilot' AND r.status='confirmed';
        qty := qty + CASE WHEN NEW.departure=ap AND NEW.departure_at>=bucket_start AND NEW.departure_at<bucket_start+make_interval(mins=>c.slot_minutes) THEN 1 ELSE 0 END
          + CASE WHEN NEW.arrival=ap AND NEW.departure_at+make_interval(mins=>NEW.duration_minutes)>=bucket_start AND NEW.departure_at+make_interval(mins=>NEW.duration_minutes)<bucket_start+make_interval(mins=>c.slot_minutes) THEN 1 ELSE 0 END;
        IF qty > c.pilot_capacity THEN RAISE EXCEPTION 'Slot complet. Choisissez un autre horaire ou la liste d’attente' USING ERRCODE = '23P01'; END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_event_reservation ON public.event_reservations;
CREATE TRIGGER guard_event_reservation BEFORE INSERT OR UPDATE ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public.guard_event_reservation();

CREATE OR REPLACE FUNCTION public.reserve_event_slot(p_user UUID, p_data JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.event_reservations%ROWTYPE; new_id UUID;
BEGIN
  r := jsonb_populate_record(NULL::public.event_reservations, p_data);
  INSERT INTO event_reservations(event_id,user_id,role,airport,position,starts_at,ends_at,movement,departure,arrival,departure_at,duration_minutes,callsign,airline,aircraft,status)
    VALUES (r.event_id,p_user,r.role,r.airport,r.position,r.starts_at,r.ends_at,r.movement,r.departure,r.arrival,r.departure_at,r.duration_minutes,upper(trim(r.callsign)),r.airline,r.aircraft,coalesce(r.status,'confirmed')) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
CREATE OR REPLACE FUNCTION public.manage_event_reservation(p_actor UUID,p_id UUID,p_action TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.event_reservations%ROWTYPE; staff BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  SELECT * INTO r FROM event_reservations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable'; END IF;
  SELECT role = 'admin' INTO staff FROM profiles WHERE id = p_actor AND (blocked_until IS NULL OR blocked_until <= now());
  IF NOT coalesce(staff,false) AND r.user_id <> p_actor THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF p_action = 'cancel' THEN UPDATE event_reservations SET status = 'cancelled' WHERE id = r.id;
  ELSIF p_action = 'ready' AND r.status = 'confirmed' THEN UPDATE event_reservations SET ready_at = now() WHERE id = r.id;
  ELSIF p_action = 'promote' AND staff AND r.status = 'waitlisted' THEN UPDATE event_reservations SET status = 'confirmed' WHERE id = r.id;
  ELSIF p_action = 'no_show' AND staff AND r.status = 'confirmed' THEN UPDATE event_reservations SET status = 'no_show' WHERE id = r.id;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
  RETURN r.id;
END $$;
CREATE OR REPLACE FUNCTION public.edit_event_slot(p_actor UUID,p_id UUID,p_data JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_r public.event_reservations%ROWTYPE; r public.event_reservations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  SELECT * INTO old_r FROM event_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR old_r.user_id<>p_actor THEN RAISE EXCEPTION 'Réservation non autorisée' USING ERRCODE='42501'; END IF;
  IF old_r.claimed_at IS NOT NULL OR old_r.status NOT IN ('confirmed','waitlisted') THEN RAISE EXCEPTION 'Cette réservation ne peut plus être modifiée'; END IF;
  r := jsonb_populate_record(NULL::public.event_reservations,p_data);
  IF r.event_id IS DISTINCT FROM old_r.event_id OR r.role<>old_r.role THEN RAISE EXCEPTION 'La modification doit conserver le rôle et l’événement'; END IF;
  UPDATE event_reservations SET airport=r.airport,position=r.position,starts_at=r.starts_at,ends_at=r.ends_at,
    movement=r.movement,departure=r.departure,arrival=r.arrival,departure_at=r.departure_at,duration_minutes=r.duration_minutes,
    callsign=upper(trim(r.callsign)),airline=r.airline,aircraft=r.aircraft,status=r.status,ready_at=NULL WHERE id=p_id;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.edit_event_slot(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_event_slot(UUID,UUID,JSONB) TO service_role;

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
CREATE OR REPLACE FUNCTION public.guard_major_event_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB; ids UUID[];
BEGIN
  IF TG_OP='UPDATE' AND NEW.aeroport_depart IS NOT DISTINCT FROM OLD.aeroport_depart
    AND NEW.aeroport_arrivee IS NOT DISTINCT FROM OLD.aeroport_arrivee AND NEW.numero_vol IS NOT DISTINCT FROM OLD.numero_vol
    AND NEW.heure_depart_estimee IS NOT DISTINCT FROM OLD.heure_depart_estimee AND NEW.temps_prev_min IS NOT DISTINCT FROM OLD.temps_prev_min
    AND NEW.pilote_id IS NOT DISTINCT FROM OLD.pilote_id THEN RETURN NEW; END IF;
  -- Un déroutement d'un vol existant n'est pas un nouveau dépôt.
  IF TG_OP='UPDATE' AND to_jsonb(NEW)->>'deroutement_at' IS NOT NULL AND
    to_jsonb(NEW)->>'deroutement_at' IS DISTINCT FROM to_jsonb(OLD)->>'deroutement_at' THEN RETURN NEW; END IF;
  result := check_major_event_flight(NEW.pilote_id,NEW.aeroport_depart,NEW.aeroport_arrivee,NEW.heure_depart_estimee,NEW.temps_prev_min,NEW.numero_vol,NEW.id);
  SELECT coalesce(array_agg(x::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(result->'ids') x;
  IF TG_OP='UPDATE' AND cardinality(OLD.event_booking_ids)>0 AND NOT OLD.event_booking_ids <@ ids THEN
    RAISE EXCEPTION 'Le plan ne correspond plus à sa réservation. Annulez le plan avant de changer de vol';
  END IF;
  NEW.event_booking_ids := ids; NEW.event_title := result->>'title'; NEW.event_slot_time := (result->>'slot_time')::timestamptz;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.claim_major_event_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE event_reservations SET plan_id=NEW.id,claimed_at=coalesce(claimed_at,now()) WHERE id=ANY(NEW.event_booking_ids);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_major_event_plan ON public.plans_vol;
CREATE TRIGGER guard_major_event_plan BEFORE INSERT OR UPDATE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_major_event_plan();
DROP TRIGGER IF EXISTS claim_major_event_plan ON public.plans_vol;
CREATE TRIGGER claim_major_event_plan AFTER INSERT OR UPDATE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.claim_major_event_plan();

CREATE OR REPLACE FUNCTION public.guard_reserved_atc_position()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  IF EXISTS (SELECT 1 FROM event_reservations WHERE role='atc' AND status='confirmed' AND airport=NEW.aeroport AND position=NEW.position
    AND starts_at<=now() AND ends_at>now() AND user_id<>NEW.user_id) THEN
    RAISE EXCEPTION 'Cette position est réservée à un autre contrôleur sur ce créneau';
  END IF;
  IF EXISTS (SELECT 1 FROM major_event_configs c JOIN site_calendar_events e ON e.id=c.event_id
    WHERE c.enabled AND NEW.aeroport=ANY(c.airports) AND e.starts_at<=now() AND e.ends_at>now())
    AND NOT EXISTS (SELECT 1 FROM event_reservations WHERE role='atc' AND status='confirmed' AND user_id=NEW.user_id
      AND airport=NEW.aeroport AND position=NEW.position AND starts_at<=now() AND ends_at>now()) THEN
    RAISE EXCEPTION 'Réservez cette position avant de prendre le service pendant l’événement majeur';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_reserved_atc_position ON public.atc_sessions;
CREATE TRIGGER guard_reserved_atc_position BEFORE INSERT OR UPDATE OF aeroport,position ON public.atc_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_atc_position();

CREATE OR REPLACE FUNCTION public.save_major_calendar_event(p_actor UUID,p_id UUID,p_event JSONB,p_config JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid UUID; previous public.site_calendar_events%ROWTYPE; config public.major_event_configs%ROWTYPE;
  airports TEXT[]; positions TEXT[]; start_at TIMESTAMPTZ; end_at TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=p_actor AND role='admin' AND (blocked_until IS NULL OR blocked_until<=now())) THEN
    RAISE EXCEPTION 'Administrateur uniquement' USING ERRCODE='42501'; END IF;
  SELECT array_agg(x) INTO airports FROM jsonb_array_elements_text(p_config->'airports') x;
  SELECT array_agg(x) INTO positions FROM jsonb_array_elements_text(p_config->'atc_positions') x;
  start_at := (p_event->>'starts_at')::timestamptz; end_at := (p_event->>'ends_at')::timestamptz;
  IF start_at IS NULL OR end_at IS NULL OR end_at<=start_at OR end_at-start_at>interval '7 days' OR cardinality(airports) IS NULL OR cardinality(airports)=0 THEN
    RAISE EXCEPTION 'Début, fin et aéroports requis pour un événement majeur'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO previous FROM site_calendar_events WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Événement introuvable'; END IF;
    SELECT * INTO config FROM major_event_configs WHERE event_id=p_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM event_reservations WHERE event_id=p_id) AND
      (previous.starts_at<>start_at OR previous.ends_at IS DISTINCT FROM end_at OR config.airports IS DISTINCT FROM airports
       OR config.slot_minutes IS DISTINCT FROM (p_config->>'slot_minutes')::integer OR config.atc_positions IS DISTINCT FROM positions
       OR config.pilot_capacity IS DISTINCT FROM (p_config->>'pilot_capacity')::integer) THEN
      RAISE EXCEPTION 'Des réservations existent : horaires, aéroports, postes et capacité sont verrouillés. Fermez les inscriptions ou annulez l’événement plutôt que déplacer les réservations';
    END IF;
    UPDATE site_calendar_events SET title=p_event->>'title',description=p_event->>'description',location=p_event->>'location',
      starts_at=start_at,ends_at=end_at,announce_discord=coalesce((p_event->>'announce_discord')::boolean,false) AND coalesce((p_config->>'enabled')::boolean,true),
      announce_channel_id=p_event->>'announce_channel_id',announce_role_id=p_event->>'announce_role_id',updated_at=now() WHERE id=p_id;
    eid := p_id;
  ELSE
    INSERT INTO site_calendar_events(title,description,location,starts_at,ends_at,announce_discord,announce_channel_id,announce_role_id,created_by,created_via)
      VALUES(p_event->>'title',p_event->>'description',p_event->>'location',start_at,end_at,coalesce((p_event->>'announce_discord')::boolean,false) AND coalesce((p_config->>'enabled')::boolean,true),
        p_event->>'announce_channel_id',p_event->>'announce_role_id',p_actor,'site') RETURNING id INTO eid;
  END IF;
  INSERT INTO major_event_configs(event_id,airports,slot_minutes,pilot_capacity,atc_positions,enabled,bookings_open)
    VALUES(eid,airports,(p_config->>'slot_minutes')::integer,(p_config->>'pilot_capacity')::integer,positions,
      coalesce((p_config->>'enabled')::boolean,true),coalesce((p_config->>'bookings_open')::boolean,true))
    ON CONFLICT(event_id) DO UPDATE SET airports=excluded.airports,slot_minutes=excluded.slot_minutes,
      pilot_capacity=excluded.pilot_capacity,atc_positions=excluded.atc_positions,enabled=excluded.enabled,bookings_open=excluded.bookings_open;
  IF NOT coalesce((p_config->>'enabled')::boolean,true) THEN
    UPDATE event_reservations SET status='cancelled' WHERE event_id=eid AND claimed_at IS NULL AND status IN ('confirmed','waitlisted');
  END IF;
  RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.save_major_calendar_event(UUID,UUID,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_major_calendar_event(UUID,UUID,JSONB,JSONB) TO service_role;
CREATE OR REPLACE FUNCTION public.event_slot_usage(p_event UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) FROM (
    SELECT airport,e.starts_at+floor(extract(epoch FROM(m.at-e.starts_at))/(c.slot_minutes*60))*make_interval(mins=>c.slot_minutes) AS slot_at,count(*) AS count
    FROM major_event_configs c JOIN site_calendar_events e ON e.id=c.event_id
    JOIN (SELECT event_id,departure AS airport,departure_at AS at FROM event_reservations WHERE role='pilot' AND status='confirmed'
      UNION ALL SELECT event_id,arrival,departure_at+make_interval(mins=>duration_minutes) FROM event_reservations WHERE role='pilot' AND status='confirmed') m ON m.event_id=c.event_id
    WHERE c.event_id=p_event AND m.airport=ANY(c.airports) AND m.at>=e.starts_at AND m.at<e.ends_at
    GROUP BY airport,e.starts_at,c.slot_minutes,floor(extract(epoch FROM(m.at-e.starts_at))/(c.slot_minutes*60))
  ) result
$$;
REVOKE ALL ON FUNCTION public.event_slot_usage(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_slot_usage(UUID) TO service_role;
CREATE OR REPLACE FUNCTION public.protect_major_calendar_structure()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  IF (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at)
    AND EXISTS(SELECT 1 FROM event_reservations WHERE event_id=OLD.id) THEN
    RAISE EXCEPTION 'Horaires verrouillés : des réservations existent pour cet événement';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_major_calendar_structure ON public.site_calendar_events;
CREATE TRIGGER protect_major_calendar_structure BEFORE UPDATE ON public.site_calendar_events FOR EACH ROW EXECUTE FUNCTION public.protect_major_calendar_structure();
REVOKE ALL ON FUNCTION public.reserve_event_slot(UUID,JSONB),public.manage_event_reservation(UUID,UUID,TEXT),
  public.check_major_event_flight(UUID,TEXT,TEXT,TIMESTAMPTZ,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_event_slot(UUID,JSONB),public.manage_event_reservation(UUID,UUID,TEXT),
  public.check_major_event_flight(UUID,TEXT,TEXT,TIMESTAMPTZ,INTEGER,TEXT,UUID) TO service_role;
COMMIT;
