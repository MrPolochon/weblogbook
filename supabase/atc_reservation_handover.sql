-- Relève des positions réservées : clôture atomique, salaire conservé.
BEGIN;
CREATE TABLE IF NOT EXISTS public.atc_reservation_evictions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.event_reservations(id),
  aeroport TEXT NOT NULL, position TEXT NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL, cleanup_at TIMESTAMPTZ
);
ALTER TABLE public.atc_reservation_evictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atc_reservation_evictions FROM anon,authenticated;
GRANT ALL ON public.atc_reservation_evictions TO service_role;

CREATE OR REPLACE FUNCTION public.finish_atc_service(p_session UUID,p_force BOOLEAN DEFAULT false,p_end TIMESTAMPTZ DEFAULT now())
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.atc_sessions%ROWTYPE; mins INTEGER; rate INTEGER; taxes BIGINT; total BIGINT; account UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(714201910);
  SELECT * INTO s FROM atc_sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'alreadyEnded',true); END IF;
  IF NOT p_force AND EXISTS(SELECT 1 FROM plans_vol WHERE current_holder_user_id=s.user_id
    AND coalesce(automonitoring,false)=false AND statut IN ('depose','en_attente','en_cours','accepte','en_attente_cloture')) THEN
    RAISE EXCEPTION 'FLIGHTS_HELD' USING ERRCODE='23514';
  END IF;
  mins := greatest(0,floor(extract(epoch FROM(least(p_end,now())-s.started_at))/60)::integer);
  rate := CASE s.position WHEN 'Delivery' THEN 200 WHEN 'Clairance' THEN 200 WHEN 'Ground' THEN 400 WHEN 'Tower' THEN 600 WHEN 'APP' THEN 800 WHEN 'DEP' THEN 800 WHEN 'Center' THEN 1000 ELSE 0 END;
  SELECT coalesce(sum(montant),0) INTO taxes FROM atc_taxes_pending WHERE session_id=s.id;
  total := mins::bigint*rate+taxes;
  IF total>0 THEN
    SELECT id INTO account FROM felitz_comptes WHERE proprietaire_id=s.user_id AND type='personnel' ORDER BY created_at,id LIMIT 1;
    IF account IS NULL THEN
      INSERT INTO felitz_comptes(type,proprietaire_id,vban,solde)
        VALUES('personnel',s.user_id,'MIXOU'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,22)),0) RETURNING id INTO account;
    END IF;
    INSERT INTO messages(destinataire_id,expediteur_id,titre,contenu,type_message,cheque_montant,cheque_encaisse,cheque_destinataire_compte_id,cheque_libelle,cheque_pour_compagnie)
      VALUES(s.user_id,NULL,'Salaire ATC - '||s.aeroport||' '||s.position,
        format('Fin de service sur %s %s. Durée : %s min. Salaire : %s F$. Taxes : %s F$. Total : %s F$.',s.aeroport,s.position,mins,mins::bigint*rate,taxes,total),
        'cheque_taxes_atc',total,false,account,'Salaire ATC - '||s.aeroport||' '||s.position||' ('||mins||' min)',false);
  END IF;
  UPDATE profiles SET atc_temps_total_minutes=coalesce(atc_temps_total_minutes,0)+mins WHERE id=s.user_id;
  UPDATE plans_vol SET current_holder_user_id=NULL,current_holder_position=NULL,current_holder_aeroport=NULL,
    pending_transfer_aeroport=NULL,pending_transfer_position=NULL,pending_transfer_at=NULL,strip_zone=NULL,
    automonitoring=CASE WHEN statut IN ('accepte','en_cours','en_attente_cloture') THEN true ELSE automonitoring END
    WHERE current_holder_user_id=s.user_id;
  DELETE FROM atc_taxes_pending WHERE session_id=s.id;
  DELETE FROM atc_sessions WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'chequeEnvoye',total>0,'montant',total);
END $$;
REVOKE ALL ON FUNCTION public.finish_atc_service(UUID,BOOLEAN,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_atc_service(UUID,BOOLEAN,TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_atc_reservations()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE conflict RECORD; result JSONB; qty INTEGER:=0;
BEGIN
  -- Même verrou que la réservation : annulation/modification et relève ne se croisent pas.
  IF NOT EXISTS(SELECT 1 FROM event_reservations r JOIN atc_sessions s ON s.aeroport=r.airport AND s.position=r.position
    WHERE r.role='atc' AND r.status='confirmed' AND r.starts_at<=now() AND r.ends_at>now() AND r.user_id<>s.user_id) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(714201910);
  FOR conflict IN SELECT DISTINCT ON(s.id) s.id,s.user_id,s.aeroport,s.position,r.id AS reservation_id,r.starts_at
    FROM atc_sessions s JOIN event_reservations r ON s.aeroport=r.airport AND s.position=r.position
    WHERE r.role='atc' AND r.status='confirmed' AND r.starts_at<=now() AND r.ends_at>now() AND r.user_id<>s.user_id
    ORDER BY s.id,r.starts_at LOOP
    result:=finish_atc_service(conflict.id,true,conflict.starts_at);
    IF NOT coalesce((result->>'alreadyEnded')::boolean,false) THEN
      INSERT INTO atc_reservation_evictions(session_id,user_id,reservation_id,aeroport,position,ended_at)
        VALUES(conflict.id,conflict.user_id,conflict.reservation_id,conflict.aeroport,conflict.position,conflict.starts_at) ON CONFLICT DO NOTHING;
      qty:=qty+1;
    END IF;
  END LOOP;
  RETURN qty;
END $$;
REVOKE ALL ON FUNCTION public.enforce_atc_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_atc_reservations() TO service_role;
COMMIT;

-- Supabase Cron : fonctionne aussi si le navigateur du contrôleur est fermé.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('atc-reservation-handover','1 second','SELECT public.enforce_atc_reservations()');
SELECT cron.schedule('atc-reservation-handover-log-cleanup','17 4 * * *',
  $cron$DELETE FROM cron.job_run_details WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='atc-reservation-handover') AND end_time<now()-interval '1 day'$cron$);
