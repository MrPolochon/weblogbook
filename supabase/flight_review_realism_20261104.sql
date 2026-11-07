-- Apply after flight economy, company itineraries and review experiences.
BEGIN;

CREATE TABLE IF NOT EXISTS public.company_review_preferences (
  company_id uuid PRIMARY KEY REFERENCES public.compagnies(id) ON DELETE CASCADE,
  voice text NOT NULL DEFAULT 'mixed' CHECK (voice IN ('mixed','short','story')),
  focus text NOT NULL DEFAULT 'balanced' CHECK (focus IN ('balanced','cabin','network','timing'))
);
CREATE TABLE IF NOT EXISTS public.flight_review_rewrite_jobs (
  plan_id uuid PRIMARY KEY REFERENCES public.plans_vol(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_review_rewrite_ready ON public.flight_review_rewrite_jobs(available_at);
ALTER TABLE public.company_review_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_review_rewrite_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_review_preferences, public.flight_review_rewrite_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_review_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.save_company_review_preferences(p_actor uuid,p_company uuid,p_voice text,p_focus text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT company_development_is_leader(p_actor,p_company) THEN
    RAISE EXCEPTION 'Réglages réservés à la direction de la compagnie.' USING ERRCODE='42501';
  END IF;
  INSERT INTO company_review_preferences(company_id,voice,focus) VALUES(p_company,p_voice,p_focus)
  ON CONFLICT(company_id) DO UPDATE SET voice=excluded.voice,focus=excluded.focus;
END $$;

-- Freeze the passenger-facing offering with the quote, alongside economic terms.
CREATE OR REPLACE FUNCTION public.capture_flight_review_offering() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid; offering jsonb; network uuid;
BEGIN
  company:=nullif(NEW.scope->>'compagnie_id','')::uuid;
  IF company IS NULL THEN RETURN NEW; END IF;
  SELECT alliance_id INTO network FROM compagnies WHERE id=company;
  SELECT jsonb_build_object(
    'voice',coalesce(p.voice,'mixed'),'focus',coalesce(p.focus,'balanced'),
    'alliance',(SELECT left(nom,80) FROM alliances WHERE id=network),
    'meal',coalesce(s.service_flags->>'restauration','false')='true' AND company_development_has_unlock(company,'restauration'),
    'bags',coalesce(s.service_flags->>'bagages','false')='true' AND company_development_has_unlock(company,'bagages'),
    'assistance',coalesce(s.service_flags->>'correspondance','false')='true' AND company_development_has_unlock(company,'correspondance'),
    'research',coalesce((SELECT jsonb_agg(DISTINCT c.unlock_key) FROM company_research_projects r
      JOIN company_research_catalog c ON c.id=r.research_id WHERE r.company_id=company AND r.ready_at<=now()),'[]'),
    'partners',coalesce((SELECT jsonb_agg(left(c.nom,80) ORDER BY c.nom,c.id) FROM compagnies c
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.economy_snapshot->'codeshare_partners','[]')) item WHERE item->>'company_id'=c.id::text)),'[]'),
    'alliance_partners',coalesce((SELECT jsonb_agg(left(c.nom,80) ORDER BY c.nom,c.id) FROM compagnies c
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.economy_snapshot#>'{alliance_terms,partners}','[]')) item WHERE item->>'company_id'=c.id::text)),'[]')
  ) INTO offering
  FROM (SELECT 1) seed LEFT JOIN company_service_settings s ON s.company_id=company
  LEFT JOIN company_review_preferences p ON p.company_id=company;
  NEW.economy_snapshot:=NEW.economy_snapshot||jsonb_build_object('review_offering',offering);
  NEW.pricing:=jsonb_set(NEW.pricing,'{economy_snapshot}',NEW.economy_snapshot);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Flight review offering unavailable (%): %',SQLSTATE,SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS capture_flight_review_offering ON public.flight_submission_quotes;
CREATE TRIGGER capture_flight_review_offering BEFORE UPDATE OF economy_snapshot ON public.flight_submission_quotes
FOR EACH ROW WHEN (OLD.economy_snapshot IS NULL AND NEW.economy_snapshot IS NOT NULL)
EXECUTE FUNCTION public.capture_flight_review_offering();

CREATE OR REPLACE FUNCTION public.prepare_flight_review_rewrite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  snap jsonb:=NEW.economy_snapshot; offering jsonb:=coalesce(snap->'review_offering','{}');
  detail jsonb; context jsonb; drafts jsonb:='[]'; r record;
  carrier text; next_stop text; delay integer; diverted boolean;
  cargo boolean:=NEW.nature_transport='cargo' OR coalesce(NEW.nb_pax_genere,0)<=0;
  topics text[]; topic text; note text; draft_body text; partner text; stars integer; roll integer; slot integer;
  rotation integer; network_index integer:=0;
  flight_label text; alliance_name text:=offering->>'alliance';
  partners jsonb:=coalesce(offering->'partners','[]'); alliance_partners jsonb:=coalesce(offering->'alliance_partners','[]');
  voice text:=coalesce(offering->>'voice','mixed'); focus text:=coalesce(offering->>'focus','balanced');
BEGIN
  SELECT s.detail INTO detail FROM flight_economy_settlements s WHERE s.plan_id=NEW.id;
  IF detail IS NULL THEN RETURN NEW; END IF;
  SELECT left(nom,80) INTO carrier FROM compagnies WHERE id=NEW.compagnie_id;
  SELECT next_leg.destination INTO next_stop FROM company_itinerary_legs leg
    JOIN company_itinerary_legs next_leg ON next_leg.itinerary_id=leg.itinerary_id AND next_leg.leg_index=leg.leg_index+1
    WHERE leg.id=NEW.company_itinerary_leg_id AND next_leg.status<>'cancelled';
  delay:=greatest(0,least(1440,round(coalesce((detail->>'delay_minutes')::numeric,0))));
  diverted:=coalesce((detail->>'diverted')::boolean,false);
  flight_label:=format('%s (%s → %s)',NEW.numero_vol,NEW.aeroport_depart,NEW.aeroport_arrivee);
  context:=jsonb_build_object('flight',flight_label,'company',carrier,'cargo',cargo,'delay',delay,
    'diverted',diverted,'next_stop',next_stop,'alliance',alliance_name,'voice',voice);
  topics:=ARRAY['timing','general'];
  IF cargo THEN
    topics:=topics||ARRAY['cargo','timing'];
  ELSE
    IF offering->'research' ? 'wifi' OR snap->>'wifi_enabled'='true' THEN
      topics:=topics||ARRAY['wifi'];
    END IF;
    IF (snap->>'seat_ratio')::numeric<1 THEN topics:=topics||ARRAY['seats']; END IF;
    IF (snap->>'ife_level')::integer>0 THEN topics:=topics||ARRAY['ife']; END IF;
    IF offering->>'meal'='true' THEN topics:=topics||ARRAY['meal']; END IF;
    IF offering->>'bags'='true' THEN topics:=topics||ARRAY['bags']; END IF;
    IF next_stop IS NOT NULL THEN topics:=topics||ARRAY['connection']; END IF;
    IF alliance_name IS NOT NULL OR jsonb_array_length(partners)>0 THEN topics:=topics||ARRAY['network']; END IF;
  END IF;
  rotation:=mod(abs(hashtext(NEW.id::text)::bigint),cardinality(topics))::integer;
  FOR r IN SELECT id,review_sequence FROM flight_reviews WHERE plan_id=NEW.id ORDER BY review_sequence LOOP
    roll:=mod(abs(hashtextextended(NEW.id::text||':'||r.review_sequence,0)::numeric),100)::integer;
    slot:=r.review_sequence-1;
    topic:=CASE WHEN slot=0 THEN 'timing'
      WHEN slot=1 AND NOT cargo AND 'network'=ANY(topics) AND focus='balanced' THEN 'network'
      ELSE topics[1+mod(slot-1+rotation,cardinality(topics))] END;
    IF mod(slot,5)=1 AND NOT cargo THEN
      IF focus='network' AND 'network'=ANY(topics) THEN topic:='network';
      ELSIF focus='timing' THEN topic:='timing';
      ELSIF focus='cabin' THEN
        SELECT candidate INTO topic FROM unnest(topics) candidate WHERE candidate IN ('wifi','seats','ife','meal') LIMIT 1;
        topic:=coalesce(topic,'general');
      END IF;
    END IF;
    stars:=CASE WHEN diverted THEN 2+mod(roll,2) WHEN delay>60 THEN 1+mod(roll,3)
      WHEN delay>15 THEN 2+mod(roll,3) WHEN delay>5 THEN 3+mod(roll,2)
      WHEN roll<14 AND topic='general' THEN 3 ELSE 4+(roll>=45)::integer END;
    partner:=NULL;
    CASE topic
      WHEN 'timing' THEN note:=CASE WHEN diverted THEN 'Je vais surtout retenir le changement de destination.' WHEN delay>5 THEN format('Avec %s min de retard, j’ai dû revoir mon programme.',delay) ELSE 'Côté horaire, je n’ai rien à redire.' END;
      WHEN 'wifi' THEN
        IF snap->>'wifi_enabled'='true' AND (snap->>'wifi_price')::numeric=0 THEN note:='Le Wi-Fi inclus, c’est le détail que j’aimerais retrouver la prochaine fois.';
        ELSIF snap->>'wifi_enabled'='true' THEN note:='Du Wi-Fi, oui, mais au mégaoctet. J’aurais préféré un prix fixe.'; stars:=least(stars,4);
        ELSE note:='J’aurais aimé avoir du Wi-Fi à bord.'; IF roll<35 THEN stars:=least(stars,3); END IF;
        END IF;
      WHEN 'seats' THEN note:=CASE WHEN roll<50 THEN 'Un peu plus d’espace entre les sièges, ça se remarque.' ELSE 'Je choisis souvent mes vols pour la place en cabine. Ici, j’ai apprécié l’aménagement.' END;
      WHEN 'ife' THEN note:=CASE (snap->>'ife_level')::integer WHEN 1 THEN 'Le catalogue fait l’affaire, même si j’aurais aimé un peu plus de choix.' WHEN 2 THEN 'J’ai apprécié de voir des titres récents au catalogue.' ELSE 'Le catalogue régulièrement renouvelé, c’est un bon point.' END;
      WHEN 'meal' THEN note:=CASE WHEN roll<50 THEN 'Avoir une option de restauration à bord m’arrange bien.' ELSE 'Je retiens surtout qu’on pouvait manger à bord. C’est le genre d’option que je regarde quand je réserve.' END;
      WHEN 'bags' THEN note:=CASE WHEN roll<50 THEN 'J’apprécie qu’il y ait un service dédié aux bagages.' ELSE 'Quand je voyage avec une valise, savoir qu’il y a un service bagages compte dans mon choix.' END;
      WHEN 'connection' THEN note:=CASE WHEN offering->>'assistance'='true' THEN format('Pour la suite vers %s, l’assistance en correspondance est une option que j’apprécie.',next_stop) ELSE format('Pour la suite vers %s, j’aurais aimé une assistance en correspondance.',next_stop) END;
      WHEN 'network' THEN
        IF jsonb_array_length(partners)>0 AND (mod(network_index,2)=0 OR alliance_name IS NULL) THEN
          partner:=partners->>mod(rotation+CASE WHEN alliance_name IS NULL THEN network_index ELSE network_index/2 END,jsonb_array_length(partners));
          note:=format('L’accord avec %s me donne une autre compagnie à regarder pour un prochain voyage.',partner);
        ELSIF jsonb_array_length(alliance_partners)>0 THEN
          partner:=alliance_partners->>mod(rotation+network_index/2,jsonb_array_length(alliance_partners));
          note:=format('Pour mon prochain voyage, je regarderai aussi %s dans le réseau %s.',partner,alliance_name);
        ELSE
          partner:=alliance_name;
          note:=format('L’appartenance à %s me donne envie de regarder les possibilités du réseau.',alliance_name);
        END IF;
        network_index:=network_index+1;
        IF delay<=5 AND NOT diverted AND stars=4 AND roll<20 THEN stars:=5; END IF;
      WHEN 'cargo' THEN note:=CASE WHEN diverted OR delay>15 THEN 'Pour un envoi urgent, je comparerai les options avant de recommencer.' ELSE 'Je garderai cette liaison dans ma liste pour un prochain envoi.' END;
      ELSE note:=CASE WHEN stars<=2 THEN 'J’hésiterais à reprendre cette liaison.' WHEN stars=3 THEN 'Un trajet correct, mais je regarderai aussi ailleurs.' WHEN stars=4 THEN 'Je reprendrais cette liaison si les horaires me conviennent.' ELSE 'Je réserverais de nouveau sur cette liaison.' END;
    END CASE;
    draft_body:=CASE
      WHEN voice='short' THEN format('%s — %s',flight_label,note)
      WHEN voice='story' OR roll>=65 THEN format('Retour sur %s avec %s. %s',flight_label,carrier,note)
      WHEN roll>=30 THEN format('%s %s, chez %s.',note,flight_label,carrier)
      ELSE format('%s, vol %s. %s',carrier,flight_label,note)
    END;
    UPDATE flight_reviews SET body=draft_body,rating=stars,
      sentiment=CASE WHEN stars>=4 THEN 'positif' WHEN stars=3 THEN 'mitige' ELSE 'negatif' END
      WHERE id=r.id;
    drafts:=drafts||jsonb_build_array(jsonb_build_object('sequence',r.review_sequence,'rating',stars,'topic',topic,'observation',note,'network_name',partner));
  END LOOP;
  IF jsonb_array_length(drafts)>0 THEN
    INSERT INTO flight_review_rewrite_jobs(plan_id,payload) VALUES(NEW.id,context||jsonb_build_object('drafts',drafts))
    ON CONFLICT(plan_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The existing reviews stay visible if enrichment fails; settlement must continue.
  RAISE WARNING 'Flight review enrichment failed (%): %',SQLSTATE,SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prepare_flight_review_rewrite ON public.plans_vol;
CREATE TRIGGER prepare_flight_review_rewrite AFTER UPDATE OF review_generated_at ON public.plans_vol
FOR EACH ROW WHEN (OLD.review_generated_at IS NULL AND NEW.review_generated_at IS NOT NULL AND NEW.economy_version=2 AND NEW.review_generated_count>0)
EXECUTE FUNCTION public.prepare_flight_review_rewrite();

CREATE OR REPLACE FUNCTION public.claim_flight_review_rewrites(p_process boolean)
RETURNS TABLE(plan_id uuid,payload jsonb,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  DELETE FROM flight_review_rewrite_jobs j WHERE j.available_at<=now()
    AND (j.attempts>=3 OR j.created_at<now()-interval '2 days' OR NOT EXISTS(SELECT 1 FROM flight_reviews r WHERE r.plan_id=j.plan_id));
  IF NOT p_process THEN RETURN; END IF;
  RETURN QUERY WITH next_jobs AS (
    SELECT j.plan_id FROM flight_review_rewrite_jobs j WHERE j.available_at<=now()
    ORDER BY j.available_at,j.plan_id LIMIT 3 FOR UPDATE SKIP LOCKED
  )
  UPDATE flight_review_rewrite_jobs j SET attempts=j.attempts+1,available_at=now()+interval '10 minutes'
  FROM next_jobs n WHERE n.plan_id=j.plan_id RETURNING j.plan_id,j.payload,j.attempts;
END $$;

CREATE OR REPLACE FUNCTION public.finish_flight_review_rewrite(p_plan uuid,p_attempt integer,p_texts jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE expected integer; provided integer;
BEGIN
  SELECT jsonb_array_length(j.payload->'drafts') INTO expected FROM flight_review_rewrite_jobs j
    WHERE j.plan_id=p_plan AND j.attempts=p_attempt FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(p_texts) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  SELECT count(*) INTO provided FROM jsonb_each(p_texts) x
    WHERE x.key~'^([1-9]|[12][0-9]|30)$' AND jsonb_typeof(x.value)='string' AND length(x.value#>>'{}') BETWEEN 20 AND 500;
  IF provided<>expected OR EXISTS (
    SELECT 1 FROM flight_review_rewrite_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.payload->'drafts') d
    WHERE j.plan_id=p_plan AND NOT (p_texts ? (d->>'sequence'))
  ) THEN RETURN false; END IF;
  UPDATE flight_reviews r SET body=p_texts->>r.review_sequence::text WHERE r.plan_id=p_plan AND p_texts ? r.review_sequence::text;
  DELETE FROM flight_review_rewrite_jobs j WHERE j.plan_id=p_plan;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.save_company_review_preferences(uuid,uuid,text,text), public.capture_flight_review_offering(),
  public.prepare_flight_review_rewrite(), public.claim_flight_review_rewrites(boolean), public.finish_flight_review_rewrite(uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_review_preferences(uuid,uuid,text,text),
  public.claim_flight_review_rewrites(boolean), public.finish_flight_review_rewrite(uuid,integer,jsonb) TO service_role;
COMMIT;
