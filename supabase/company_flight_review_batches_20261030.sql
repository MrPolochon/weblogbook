-- Fictional reviews: one durable batch per flight, 3..30 load-weighted voices.
-- Zero transported load creates no new reviews. Global feed retention: 500 rows.
BEGIN;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS review_generated_count smallint;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS review_generated_at timestamptz;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.plans_vol'::regclass AND conname='plans_vol_review_batch_marker') THEN
   ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_review_batch_marker CHECK((review_generated_count IS NULL AND review_generated_at IS NULL) OR (review_generated_count IS NOT NULL AND review_generated_count BETWEEN 0 AND 30 AND review_generated_at IS NOT NULL));
 END IF;
END $$;
ALTER TABLE public.flight_reviews ADD COLUMN IF NOT EXISTS review_sequence smallint NOT NULL DEFAULT 1 CHECK(review_sequence BETWEEN 1 AND 30);
ALTER TABLE public.flight_reviews DROP CONSTRAINT IF EXISTS flight_reviews_plan_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS flight_reviews_plan_sequence_idx ON public.flight_reviews(plan_id,review_sequence);

-- Adopt already published v2 reviews before retention; never automatically
-- expand old flights. Legacy singletons remain available for the explicit admin
-- RPC below, which alone may extend them into their one zero-impact batch.
CREATE TABLE IF NOT EXISTS public.flight_review_batch_adoptions(plan_id uuid PRIMARY KEY REFERENCES public.plans_vol(id),generated_count smallint NOT NULL CHECK(generated_count BETWEEN 1 AND 30),generated_at timestamptz NOT NULL);
ALTER TABLE public.flight_review_batch_adoptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flight_review_batch_adoptions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.flight_review_batch_adoptions TO service_role;
INSERT INTO public.flight_review_batch_adoptions(plan_id,generated_count,generated_at)
SELECT r.plan_id,count(*)::smallint,min(r.created_at) FROM public.flight_reviews r JOIN public.plans_vol p ON p.id=r.plan_id
WHERE p.economy_version=2 AND p.review_generated_at IS NULL GROUP BY r.plan_id ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.guard_flight_review_adoption() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Le marqueur d’avis historique reste immuable après rétention'; END $$;
DROP TRIGGER IF EXISTS guard_flight_review_adoption ON public.flight_review_batch_adoptions;
CREATE TRIGGER guard_flight_review_adoption BEFORE UPDATE OR DELETE ON public.flight_review_batch_adoptions FOR EACH ROW EXECUTE FUNCTION public.guard_flight_review_adoption();

CREATE OR REPLACE FUNCTION public.guard_flight_review_batch_marker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.review_generated_at IS NOT NULL AND (NEW.review_generated_count IS DISTINCT FROM OLD.review_generated_count OR NEW.review_generated_at IS DISTINCT FROM OLD.review_generated_at) THEN RAISE EXCEPTION 'Le lot d’avis de ce vol a déjà été traité et reste immuable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_flight_review_batch_marker ON public.plans_vol;
CREATE TRIGGER guard_flight_review_batch_marker BEFORE UPDATE OF review_generated_count,review_generated_at ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_flight_review_batch_marker();

-- Increasing at the same draw: passengers saturate near 400 people, cargo near
-- 100,000 kg. A random factor varies the count while retaining the 3..30 bounds.
CREATE OR REPLACE FUNCTION public.flight_review_batch_size(p_pax integer,p_cargo numeric,p_transport text,p_roll numeric) RETURNS smallint
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN greatest(0,coalesce(p_pax,0))=0 AND greatest(0,coalesce(p_cargo,0))=0 THEN 0
 ELSE least(30,greatest(3,3+floor(28*least(1,sqrt(CASE WHEN p_transport='cargo' OR coalesce(p_pax,0)<=0 THEN greatest(0,coalesce(p_cargo,0))/100000 ELSE greatest(0,coalesce(p_pax,0))::numeric/400 END))*(.4+.6*greatest(0,least(1,coalesce(p_roll,0)))))))::smallint END;
$$;

CREATE OR REPLACE FUNCTION public.prune_flight_review_feed() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE removed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-reviews-global-retention:500',0));
 DELETE FROM flight_reviews WHERE id IN (SELECT id FROM flight_reviews ORDER BY created_at DESC,id DESC OFFSET 500);
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;

-- Private shared writer. Callers must validate their v2 settlement or explicit
-- legacy/admin authorization. Always lock the plan before global retention.
CREATE OR REPLACE FUNCTION public.write_flight_review_batch(p_plan uuid,p_detail jsonb,p_impact numeric,p_legacy boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; adopted flight_review_batch_adoptions%ROWTYPE; n integer; old_count integer; made integer:=0; seq integer; voice integer; angle integer; collision integer;
 name text; cargo boolean; delay numeric; tone text; stars smallint; completed timestamptz; message text; base_message text; label text;
 impact numeric:=coalesce(p_impact,0); unit_impact numeric; row_impact numeric;
 beginnings text[]; opinions text[]; names text[]:=ARRAY['Camille','Alex','Sacha','Lou','Robin','Charlie'];
 cargo_names text[]:=ARRAY['Atlas','Boréal','Cobalt','Delta','Équinoxe','Horizon']; initials text[]:=ARRAY['A.','B.','C.','D.','E.'];
BEGIN
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vol introuvable'; END IF;
 IF p.review_generated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'plan_id',p.id,'generated_count',p.review_generated_count,'created_count',0,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'replayed',true); END IF;
 SELECT * INTO adopted FROM flight_review_batch_adoptions WHERE plan_id=p.id;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'plan_id',p.id,'generated_count',adopted.generated_count,'created_count',0,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'replayed',true); END IF;
 SELECT count(*) INTO old_count FROM flight_reviews WHERE plan_id=p.id;
 IF old_count>1 OR NOT p_legacy AND old_count>0 THEN RAISE EXCEPTION 'Un historique d’avis existe déjà pour ce vol'; END IF;
 IF p_legacy AND EXISTS(SELECT 1 FROM flight_reviews WHERE plan_id=p.id AND (demand_percent<>0 OR review_sequence<>1)) THEN RAISE EXCEPTION 'L’avis historique ne permet pas une extension sans effet économique'; END IF;
 n:=flight_review_batch_size(p.nb_pax_genere,p.cargo_kg_genere,p.nature_transport,random()::numeric);
 -- Preserve an explicitly authorized pre-existing legacy singleton even when
 -- its old source records no load; no additional voice is invented in that case.
 n:=greatest(old_count,n);
 IF impact NOT BETWEEN -2 AND .25 THEN RAISE EXCEPTION 'Impact de réputation invalide'; END IF;
 IF p_legacy THEN impact:=0; END IF;
 cargo:=p.nature_transport='cargo' OR coalesce(p.nb_pax_genere,0)=0;
 delay:=greatest(0,least(1440,coalesce((p_detail->>'delay_minutes')::numeric,0)));
 completed:=coalesce(p.cloture_at,now());
 SELECT coalesce(nom,'la compagnie') INTO name FROM compagnies WHERE id=p.compagnie_id;
 IF delay<=5 THEN tone:='positif';stars:=5;
 ELSIF delay<=15 THEN tone:='mitige';stars:=3;
 ELSIF delay<=60 THEN tone:='negatif';stars:=2;
 ELSE tone:='negatif';stars:=1; END IF;
 IF cargo THEN
   beginnings:=ARRAY['Pour cet acheminement de fret','Du point de vue de notre expédition','Concernant ce transport de marchandises','Pour le suivi de notre envoi','À propos de ce trajet cargo','Pour notre opération de fret'];
   opinions:=CASE WHEN tone='positif' THEN ARRAY['Une ponctualité appréciable pour le fret.','Un horaire de transport bien respecté.','Une arrivée conforme à la marge prévue.','Le respect de cette échéance est positif.','Un résultat satisfaisant sur le critère horaire.']
     WHEN tone='mitige' THEN ARRAY['Un décalage modéré, à suivre.','L’horaire du transport pourrait être mieux tenu.','Un résultat horaire mitigé pour cet envoi.','Une arrivée un peu tardive pour ce fret.','Une marge de progrès sur la ponctualité.']
     ELSE ARRAY['Cette ponctualité est décevante pour le fret.','Le retard de cet acheminement pèse dans notre évaluation.','Le respect des horaires doit s’améliorer.','Une arrivée trop tardive pour une bonne appréciation.','Ce délai de transport appelle une amélioration.'] END;
 ELSE
   beginnings:=ARRAY['Pour mon voyage','En tant que passager','Au terme de ce trajet','Pour ce déplacement aérien','À propos de mon arrivée','Après ce vol'];
   opinions:=CASE WHEN tone='positif' THEN ARRAY['Une ponctualité que j’apprécie.','L’horaire a répondu à mon attente.','Une bonne expérience sur le plan horaire.','Je retiens le respect de l’arrivée prévue.','Un trajet satisfaisant pour sa ponctualité.']
     WHEN tone='mitige' THEN ARRAY['Un petit décalage, mais un avis partagé.','J’aurais préféré une arrivée plus ponctuelle.','Mon appréciation de l’horaire reste mitigée.','Une ponctualité encore perfectible.','Ce léger retard compte dans mon évaluation.']
     ELSE ARRAY['Une ponctualité qui me déçoit.','Ce retard pèse dans mon appréciation.','L’horaire d’arrivée doit être mieux respecté.','Une attente trop longue pour un avis favorable.','J’espère un meilleur respect des horaires à l’avenir.'] END;
 END IF;
 unit_impact:=CASE WHEN n>0 THEN impact/n ELSE 0 END;
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-reviews-global-retention:500',0));
 FOR seq IN old_count+1..n LOOP
   voice:=(seq-1)/5+1;angle:=(seq-1)%5+1;
   label:=CASE WHEN cargo THEN 'Client fret virtuel · '||cargo_names[voice] ELSE 'Voyageur virtuel · '||names[voice] END||' '||initials[angle];
   message:=format('%s avec %s, %s %s',beginnings[voice],name,CASE WHEN delay<=5 THEN 'l’arrivée est restée dans la marge de ponctualité de cinq minutes.' ELSE format('l’arrivée a eu lieu avec %s minutes de retard.',round(delay)) END,opinions[angle]);
   IF coalesce((p_detail->>'diverted')::boolean,false) THEN message:=message||format(' L’arrivée s’est finalement faite à %s après un déroutement.',p.aeroport_arrivee); END IF;
   IF NOT cargo AND coalesce((p_detail->>'wifi_enabled')::boolean,false) THEN message:=message||CASE WHEN coalesce((p_detail->>'wifi_price')::numeric,0)=0 THEN ' Le Wi-Fi gratuit était proposé à bord.' ELSE ' Une offre Wi-Fi était proposée à bord.' END; END IF;
   IF NOT cargo AND coalesce((p_detail->>'ife_level')::numeric,0)>0 THEN message:=message||' Des divertissements étaient également proposés à bord.'; END IF;
   base_message:=message;collision:=0;
   WHILE EXISTS(SELECT 1 FROM flight_reviews WHERE plan_id=p.id AND body=message) LOOP collision:=collision+1;message:=base_message||format(' Point de vue virtuel complémentaire %s.',collision); END LOOP;
   row_impact:=CASE WHEN p_legacy THEN 0 WHEN seq=n THEN impact-unit_impact*(n-1) ELSE unit_impact END;
   INSERT INTO flight_reviews(plan_id,company_id,author_label,body,sentiment,rating,demand_percent,created_at,expires_at,review_sequence)
   VALUES(p.id,p.compagnie_id,label,message,tone,stars,row_impact,completed,completed+interval '14 days',seq);
   made:=made+1;
 END LOOP;
 UPDATE plans_vol SET review_generated_count=n,review_generated_at=now() WHERE id=p.id;
 PERFORM prune_flight_review_feed();
 RETURN jsonb_build_object('ok',true,'plan_id',p.id,'generated_count',n,'created_count',made,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'replayed',false,'empty_load',coalesce(p.nb_pax_genere,0)<=0 AND coalesce(p.cargo_kg_genere,0)<=0);
END $$;

CREATE OR REPLACE FUNCTION public.publish_flight_review(p_plan uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; d jsonb; delay numeric; impact numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN; END IF;
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(p.vol_commercial,false) OR p.compagnie_id IS NULL OR p.statut<>'cloture' OR p.economy_version<>2 OR p.review_generated_at IS NOT NULL THEN RETURN; END IF;
 SELECT detail INTO d FROM flight_economy_settlements WHERE plan_id=p.id;
 IF d IS NULL THEN RETURN; END IF;
 delay:=greatest(0,least(1440,coalesce((d->>'delay_minutes')::numeric,0)));
 impact:=CASE WHEN delay<=5 THEN .25 WHEN delay<=15 THEN 0 WHEN delay<=30 THEN -.5 WHEN delay<=60 THEN -1 ELSE -2 END;
 PERFORM write_flight_review_batch(p.id,d,impact,false);
END $$;

-- Deliberate admin action only. No scan, auto-backfill or economic settlement of
-- legacy flights; this function changes reviews and their durable marker only.
CREATE OR REPLACE FUNCTION public.publish_legacy_flight_reviews(p_actor uuid,p_plan uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; departure timestamptz; scheduled timestamptz; delay numeric; d jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Publication réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND OR p.economy_version<>1 OR NOT coalesce(p.vol_commercial,false) OR p.compagnie_id IS NULL OR p.statut<>'cloture' THEN RAISE EXCEPTION 'Vol commercial historique clôturé requis'; END IF;
 departure:=coalesce(p.accepted_at,(to_jsonb(p)->>'heure_depart_reelle')::timestamptz,p.heure_depart_estimee);
 IF departure IS NULL OR p.cloture_at IS NULL OR p.cloture_at<departure OR p.cloture_at>now()+interval '5 seconds' OR coalesce(p.temps_prev_min,0)<=0 THEN RAISE EXCEPTION 'Horaires historiques cohérents requis'; END IF;
 scheduled:=coalesce(p.heure_depart_estimee,departure);
 delay:=greatest(0,extract(epoch FROM(p.cloture_at-scheduled))/60-p.temps_prev_min);
 d:=jsonb_build_object('delay_minutes',delay,'diverted',p.deroutement_at IS NOT NULL,'wifi_enabled',false,'ife_level',0);
 RETURN write_flight_review_batch(p.id,d,0,true);
END $$;

-- The existing reputation function sums the shares, keeping the old total per
-- complete flight batch. When global retention cuts an old batch, only its
-- retained voices continue to contribute; publication never multiplies impact.
SELECT public.prune_flight_review_feed();
REVOKE ALL ON FUNCTION public.guard_flight_review_batch_marker(),public.guard_flight_review_adoption(),public.flight_review_batch_size(integer,numeric,text,numeric),public.prune_flight_review_feed(),public.write_flight_review_batch(uuid,jsonb,numeric,boolean),public.publish_flight_review(uuid),public.publish_legacy_flight_reviews(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_flight_review(uuid),public.publish_legacy_flight_reviews(uuid,uuid) TO service_role;
COMMIT;
