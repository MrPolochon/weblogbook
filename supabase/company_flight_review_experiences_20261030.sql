-- Diverse subjective opinions; financial impact per batch remains unchanged.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.render_flight_review_voice_style_base(jsonb,jsonb,integer)') IS NULL THEN
 ALTER FUNCTION public.render_flight_review_voice(jsonb,jsonb,integer) RENAME TO render_flight_review_voice_style_base;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.render_flight_review_voice(p_plan jsonb,p_detail jsonb,p_sequence integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; snap jsonb:=p_plan->'economy_snapshot'; known boolean; wifi boolean; cargo boolean; roll integer; topic integer; stars integer; tone text; delay numeric; observation text; company text; ratio numeric; ife integer;
BEGIN
 r:=render_flight_review_voice_style_base(p_plan,p_detail,p_sequence);
 known:=coalesce((p_plan->>'economy_version')::integer,1)=2 AND snap IS NOT NULL AND snap<>'null'::jsonb;
 wifi:=coalesce((snap->>'wifi_enabled')::boolean,(p_detail->>'wifi_enabled')::boolean,false);
 ife:=coalesce((snap->>'ife_level')::integer,(p_detail->>'ife_level')::integer,0);
 ratio:=coalesce((snap->>'seat_ratio')::numeric,1);
 cargo:=p_plan->>'nature_transport'='cargo' OR coalesce((p_plan->>'nb_pax_genere')::integer,0)=0;
 roll:=mod(abs(hashtext(coalesce(p_plan->>'id','')||':'||p_sequence::text||':experience-v1')::bigint),100)::integer;
 topic:=mod(p_sequence-1,6);
 delay:=greatest(0,coalesce((p_detail->>'delay_minutes')::numeric,0));
 stars:=CASE WHEN delay>60 THEN 1+mod(roll,3) WHEN delay>15 THEN 2+mod(roll,3) WHEN delay>5 THEN 3+mod(roll,2) WHEN roll<25 THEN 3 WHEN roll<65 THEN 4 ELSE 5 END;
 -- Even the smallest generated batch includes a less-than-perfect opinion.
 IF p_sequence=1 THEN stars:=least(stars,4); END IF;
 SELECT nom INTO company FROM compagnies WHERE id=(p_plan->>'compagnie_id')::uuid;
 company:=coalesce(company,'la compagnie');
 IF NOT cargo AND topic=0 THEN
  IF known AND NOT wifi THEN observation:=CASE mod(roll,3) WHEN 0 THEN 'Pas de Wi-Fi proposé sur ce vol, c’est dommage pour rester connecté.' WHEN 1 THEN 'L’absence de Wi-Fi a compté dans ma note. J’aimerais vraiment cette option la prochaine fois.' ELSE 'J’aurais préféré pouvoir me connecter pendant le vol : le Wi-Fi n’était pas proposé.' END;stars:=least(stars,3);
  ELSIF wifi AND coalesce((snap->>'wifi_price')::numeric,(p_detail->>'wifi_price')::numeric,0)>0 THEN observation:='Le Wi-Fi est proposé, mais je préférerais qu’il soit inclus dans le billet.';stars:=least(stars,4);
  ELSIF wifi THEN observation:='Le Wi-Fi gratuit est un vrai plus dans mon choix de compagnie.';
  ELSE observation:='Pour mes prochains voyages, j’aimerais une offre Wi-Fi clairement présentée avant le départ.';stars:=least(stars,4); END IF;
 ELSIF NOT cargo AND topic=1 THEN
  observation:=CASE WHEN known AND ratio<.9 THEN 'L’aménagement laisse plus d’espace, ce qui correspond bien à mes préférences.' WHEN known THEN 'Côté sièges, je préférerais davantage de place. C’est surtout ce qui m’a manqué pour être pleinement satisfait.' ELSE 'Je suis assez exigeant sur le confort des sièges : davantage d’espace ferait la différence pour moi.' END;
  IF NOT known OR ratio>=.9 THEN stars:=least(stars,3); END IF;
 ELSIF NOT cargo AND topic=2 THEN
  observation:=CASE WHEN known AND ife=0 THEN 'Aucun programme de divertissement n’était proposé. Un catalogue à bord rendrait le trajet plus agréable pour moi.' WHEN ife>0 THEN CASE WHEN ife<3 THEN 'Il y a des divertissements, mais un choix plus renouvelé me donnerait davantage envie de revenir.' ELSE 'Le programme de divertissement renouvelé compte parmi les options que j’apprécie.' END ELSE 'J’aimerais trouver plus de choix de divertissement pour mes prochains trajets.' END;
  IF NOT known OR ife<3 THEN stars:=least(stars,4); END IF;
 ELSIF cargo AND topic<3 THEN
  observation:=CASE topic WHEN 0 THEN 'Pour mes prochains envois, j’aimerais une présentation plus détaillée de l’offre cargo.' WHEN 1 THEN 'Je compare aussi les prix au kilo : le tarif reste important dans mon choix, même si le trajet est terminé.' ELSE 'Mon avis est partagé : cette liaison m’intéresse, mais je garde mes autres options pour un prochain envoi.' END;stars:=least(stars,4);
 ELSIF topic=3 THEN observation:=CASE WHEN stars>=4 THEN 'Cette liaison me convient, même si je ne mets pas systématiquement la note maximale.' ELSE 'Ce trajet ne correspond pas tout à fait à mes préférences. Je comparerai les autres options avant de réserver à nouveau.' END;stars:=least(stars,4);
 ELSIF topic=4 AND stars<4 THEN observation:='Un bilan mitigé pour moi. Arriver à destination ne suffit pas à rendre chaque prestation parfaite.';
 END IF;
 IF observation IS NOT NULL THEN
  r:=jsonb_set(r,'{body}',to_jsonb(format((ARRAY['Mon retour sur %s : %s','%s, voici ce qui compte pour moi. %s','Après cette étape avec %s, voilà mon avis : %s','Petit bilan de mon expérience avec %s. %s','Pour un prochain trajet avec %s, je retiens ceci : %s'])[1+(p_sequence-1)/6],company,observation)||CASE WHEN delay>5 THEN format(' Le retard enregistré de %s minutes pèse aussi dans mon avis.',round(delay)) ELSE '' END));
 END IF;
 tone:=CASE WHEN stars>=4 THEN 'positif' WHEN stars=3 THEN 'mitige' ELSE 'negatif' END;
 RETURN r||jsonb_build_object('rating',stars,'sentiment',tone);
END $$;
CREATE OR REPLACE FUNCTION public.write_flight_review_batch(p_plan uuid,p_detail jsonb,p_impact numeric,p_legacy boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; adopted flight_review_batch_adoptions%ROWTYPE; n integer; old_count integer; made integer:=0; seq integer; voice integer; angle integer; collision integer;
 name text; cargo boolean; delay numeric; tone text; stars smallint; completed timestamptz; message text; base_message text; label text;
 impact numeric:=coalesce(p_impact,0); unit_impact numeric; row_impact numeric;
 rendered jsonb; beginnings text[]; opinions text[]; names text[]:=ARRAY['Camille','Alex','Sacha','Lou','Robin','Charlie'];
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
 unit_impact:=CASE WHEN n>0 THEN impact/n ELSE 0 END;
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-reviews-global-retention:500',0));
 FOR seq IN old_count+1..n LOOP
   rendered:=render_flight_review_voice(to_jsonb(p),p_detail,seq);
   label:=rendered->>'author_label';message:=rendered->>'body';stars:=(rendered->>'rating')::smallint;tone:=rendered->>'sentiment';
   base_message:=message;collision:=0;
   WHILE EXISTS(SELECT 1 FROM flight_reviews WHERE plan_id=p.id AND body=message) LOOP collision:=collision+1;message:=base_message||format(' Mon point de vue complémentaire %s.',collision); END LOOP;
   row_impact:=CASE WHEN p_legacy THEN 0 WHEN seq=n THEN impact-unit_impact*(n-1) ELSE unit_impact END;
   INSERT INTO flight_reviews(plan_id,company_id,author_label,body,sentiment,rating,demand_percent,created_at,expires_at,review_sequence)
   VALUES(p.id,p.compagnie_id,label,message,tone,stars,row_impact,completed,completed+interval '14 days',seq);
   made:=made+1;
 END LOOP;
 UPDATE plans_vol SET review_generated_count=n,review_generated_at=now() WHERE id=p.id;
 PERFORM prune_flight_review_feed();
 RETURN jsonb_build_object('ok',true,'plan_id',p.id,'generated_count',n,'created_count',made,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'replayed',false,'empty_load',coalesce(p.nb_pax_genere,0)<=0 AND coalesce(p.cargo_kg_genere,0)<=0);
END $$;

CREATE OR REPLACE FUNCTION public.refresh_flight_review_experiences(p_actor uuid,p_plan uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; d jsonb; departure timestamptz; scheduled timestamptz; r record; rendered jsonb; changed integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Réécriture réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(p.vol_commercial,false) OR p.compagnie_id IS NULL OR p.statut<>'cloture' THEN RAISE EXCEPTION 'Vol commercial clôturé requis'; END IF;
 SELECT detail INTO d FROM flight_economy_settlements WHERE plan_id=p.id;
 IF p.economy_version=2 AND d IS NULL THEN RAISE EXCEPTION 'Règlement économique requis'; END IF;
 IF d IS NULL THEN
   departure:=coalesce(p.accepted_at,(to_jsonb(p)->>'heure_depart_reelle')::timestamptz,p.heure_depart_estimee);
   scheduled:=coalesce(p.heure_depart_estimee,departure);
   IF scheduled IS NULL OR p.cloture_at IS NULL OR p.cloture_at<departure OR coalesce(p.temps_prev_min,0)<=0 THEN RAISE EXCEPTION 'Horaires historiques cohérents requis'; END IF;
   d:=jsonb_build_object('delay_minutes',greatest(0,extract(epoch FROM(p.cloture_at-scheduled))/60-p.temps_prev_min),'diverted',p.deroutement_at IS NOT NULL,'wifi_enabled',false,'ife_level',0);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-reviews-global-retention:500',0));
 FOR r IN SELECT id,review_sequence FROM flight_reviews WHERE plan_id=p.id ORDER BY review_sequence FOR UPDATE LOOP
   rendered:=render_flight_review_voice(to_jsonb(p),d,r.review_sequence);
   UPDATE flight_reviews SET body=rendered->>'body',author_label=rendered->>'author_label',rating=(rendered->>'rating')::smallint,sentiment=rendered->>'sentiment' WHERE id=r.id AND (body IS DISTINCT FROM rendered->>'body' OR author_label IS DISTINCT FROM rendered->>'author_label' OR rating IS DISTINCT FROM (rendered->>'rating')::smallint OR sentiment IS DISTINCT FROM rendered->>'sentiment');
   IF FOUND THEN changed:=changed+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'plan_id',p.id,'rewritten_count',changed,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'generated_count',p.review_generated_count,'count_unchanged',true,'reputation_unchanged',true);
END $$;
REVOKE ALL ON FUNCTION public.render_flight_review_voice_style_base(jsonb,jsonb,integer),public.render_flight_review_voice(jsonb,jsonb,integer),public.refresh_flight_review_experiences(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_flight_review_experiences(uuid,uuid) TO service_role;
COMMIT;
