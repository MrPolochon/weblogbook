-- Text-only review styling. Existing batch counts, markers and reputation stay unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.render_flight_review_voice(p_plan jsonb,p_detail jsonb,p_sequence integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; origin text:=coalesce(nullif(p_plan->>'aeroport_depart',''),'le départ'); destination text:=coalesce(nullif(p_plan->>'aeroport_arrivee',''),'l’arrivée'); route text; model text; aircraft text; elapsed numeric; duration text; arrival_time timestamptz; departure_time timestamptz; arrival text; arrival_clock text; timing text; opinion text; services text; body text; author text; slot integer; tone text; delay numeric; cargo boolean; extras text:=''; item record;
 passenger_templates text[]:=ARRAY['{company}, je vous garde dans mes choix pour {destination}. {Opinion}',
'Me voilà à {destination} {arrival}. {company} assurait cette étape depuis {origin}.',
'{duration} entre {origin} et {destination} avec {company}. {Opinion}',
'Pas besoin d’un roman : {opinion} C’était {company} sur {route}.',
'Le vol {number} de {company} est terminé. {Timing}',
'Si je refais {route}, mon expérience avec {company} comptera dans mon choix. {Opinion}',
'De {origin} à {destination} {aircraft}, avec {company}. Je retiens cette étape.',
'Un point concret sur {company} : {timing} C’est important dans mon appréciation.',
'{company} : {short_verdict}',
'J’ai fait {route} avec {company}. {Services}',
'Ce {number} m’a amené à {destination} {arrival}. {company} : {opinion}',
'À propos de {company}, je préfère parler de ce vol précis. {route} : {timing}',
'Pour cette étape, c’était {company} {aircraft}. {Opinion}',
'L’arrivée à {destination} marque la fin de ce trajet {route} avec {company}. {Opinion}',
'Je laisse quelques mots pour {company} après {duration}. {Opinion}',
'{company} sur {route} : {services} Voilà ce que je voulais relever.',
'En regardant l’heure à {destination}, je retiens ceci pour {company} : {timing}',
'{origin} derrière moi, {destination} devant. Une étape assurée par {company} ; {opinion}',
'Trajet bouclé avec {company}. {duration} et une arrivée à {destination}.',
'Cette fois, {company} {aircraft} pour rejoindre {destination}. {Opinion}',
'Mon choix de compagnie se construit vol après vol. Pour ce {route} avec {company}, {opinion}',
'Il est {arrival_clock} à la fin de ce vol {company} vers {destination}. {Timing}',
'Le {number}, {origin} → {destination}, restera une expérience de plus avec {company}. {Opinion}',
'Ce que je note sur mon voyage avec {company} ? {Services}',
'Une liaison vers {destination}, {duration}, et {company} pour cette rotation. {Opinion}',
'Petit message après mon arrivée depuis {origin} : {company}, {opinion}',
'J’ai rejoint {destination} avec {company} {aircraft}. {Timing}',
'Pour aller de {origin} à {destination}, j’avais choisi {company}. {Opinion} Je m’en souviendrai pour un prochain départ.',
'{route} avec {company}, en quelques mots : {opinion}',
'{company} m’a amené jusqu’à {destination} {arrival}. Une étape de plus depuis {origin} ; {opinion}'];
 cargo_templates text[]:=ARRAY['{company} a assuré le volet aérien de cet envoi sur {route}. {Opinion}',
'Le fret est arrivé à {destination} {arrival}. Je retiens cet horaire pour la rotation de {company}.',
'{load} sur cette rotation de {company}. Le transport aérien mérite aussi ses avis clients.',
'Pour mes prochains transports sur {route}, l’expérience de ce vol avec {company} comptera. {Opinion}',
'Un point sur l’acheminement de {company} : {timing}',
'{duration} pour relier {origin} à {destination} sous les couleurs de {company}.',
'Côté appareil, ce transport de {company} s’est fait {aircraft}. {Opinion}',
'Je regarde surtout le résultat de la liaison cargo {route}. Pour {company}, {opinion}',
'Rotation {number} terminée à {destination}. {company} était l’opérateur de ce transport.',
'Pas de long commentaire sur {company} : {opinion} Il s’agit du trajet {route}.',
'La ponctualité compte aussi dans le fret. Sur cette rotation de {company}, {timing}',
'Arrivée {arrival_clock} à {destination} pour ce vol cargo de {company}. Un repère concret pour comparer cette liaison.',
'Au départ de {origin}, notre envoi a pris la voie aérienne avec {company}. {Opinion}',
'Cette rotation représentait {load}. Avec {company}, le trajet aérien s’est terminé à {destination}.',
'Une référence de plus sur l’axe {route} : {company}, {duration}. {Opinion}',
'Quand je compare des opérateurs, je regarde des vols précis. Pour celui de {company} vers {destination}, {timing}',
'{destination} rejoint par le vol {number} de {company}. Mon avis concerne cette partie aérienne de l’acheminement.',
'J’ai noté le matériel de cette rotation : {aircraft}, avec {company}. {Opinion}',
'Le trajet {origin} → {destination} est achevé pour ce fret de {company}. {Opinion}',
'{company} sur cette liaison cargo : {timing} Cela pèse dans mon évaluation.',
'Pour {load} transportés sur {route}, {company} était notre opérateur. {Opinion}',
'Ce vol vers {destination} ajoute une expérience à mon appréciation de {company}. {Opinion}',
'Un transport aérien de {duration} avec {company}. Je garde le résultat de cette rotation en tête.',
'Retour côté expéditeur sur {company}, au terme de {route} : {opinion}',
'Le {number} de {company} a rejoint {destination} {arrival}. {Timing}',
'À propos de cet envoi, je distingue le transport aérien de la livraison finale. Ici, je parle du vol {company} sur {route}.',
'{load}, {origin}, puis {destination} : voilà la rotation de {company} à laquelle se rapporte mon avis.',
'Ce que je retiens pour {company} aujourd’hui, c’est cette liaison vers {destination}. {Opinion}',
'En {duration}, ce fret a effectué le trajet {route} avec {company}. {Timing}',
'Une rotation, pas un jugement sur tous les transports : {number}, assuré par {company}. {Opinion}'];
 positive text[]:=ARRAY['je reprendrais volontiers cette compagnie.',
'une bonne impression après ce trajet.',
'ça me donne envie de renouveler l’expérience.',
'j’ai apprécié cette étape.',
'ça me va très bien.',
'je repars avec un avis favorable.',
'cette expérience compte en sa faveur.',
'j’ai bien aimé.',
'une option que je garderai en tête.',
'je suis satisfait de ce vol.',
'je retenterais bien.',
'mon appréciation est positive.',
'une expérience que je referais.',
'ce trajet m’a laissé une bonne impression.',
'une étape satisfaisante, tout simplement.',
'je garderai cet opérateur dans mes choix.',
'ça mérite un bon retour.',
'je suis content d’avoir fait ce trajet.',
'une bonne expérience sur cette liaison.',
'je le retiens pour une prochaine rotation.',
'franchement, ça me plaît.',
'je laisse volontiers un avis positif.',
'je referais ce choix pour une autre étape.',
'ça mérite un petit mot positif.',
'je garde cette compagnie en tête pour la suite.',
'ce vol me donne envie de recommencer.',
'c’est une expérience que je recommande.',
'je conserve une appréciation favorable.',
'un choix qui me convient sur cet axe.',
'je garderai un bon souvenir de cette étape.'];
 mixed text[]:=ARRAY['mon avis reste partagé.',
'un résultat correct, sans grand enthousiasme.',
'j’aurais préféré une arrivée plus ponctuelle.',
'je retiens un bilan mitigé de cette étape.',
'ce petit décalage compte dans mon appréciation.',
'une expérience moyenne sur cette liaison.',
'je garde quelques réserves sur le résultat horaire.',
'il y a encore une marge de progrès.',
'mon appréciation reste mesurée.',
'je comparerai avant de refaire ce choix.'];
 negative text[]:=ARRAY['je suis déçu de cette arrivée.',
'ce retard pèse dans mon appréciation.',
'je m’attendais à un meilleur respect de l’horaire.',
'ce trajet ne me donne pas envie de recommencer dans ces conditions.',
'j’aurais préféré garder un autre souvenir de ce vol.',
'le délai d’arrivée est difficile à apprécier positivement.',
'je retiens un bilan défavorable de cette rotation.',
'j’espère une vraie amélioration de la ponctualité.',
'cette arrivée tardive ne me satisfait pas.',
'ce résultat joue contre cet opérateur dans mes prochains choix.'];
 names text[]:=ARRAY['Camille',
'Alex',
'Sacha',
'Nora',
'Léo',
'Aya',
'Mehdi',
'Chloé',
'Lucas',
'Sara',
'Inès',
'Tom',
'Maya',
'Eliott',
'Lina',
'Jules',
'Zoé',
'Adam',
'Anna',
'Hugo',
'Louise',
'Naël',
'Emma',
'Simon',
'Clara',
'Enzo',
'Jade',
'Noah',
'Amir',
'Nina'];
BEGIN
 IF p_sequence NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Séquence d’avis invalide'; END IF;
 SELECT nom INTO company FROM compagnies WHERE id=(p_plan->>'compagnie_id')::uuid;
 company:=coalesce(nullif(company,''),'la compagnie');
 origin:=CASE origin WHEN 'IRFD' THEN 'Rockford (IRFD)' WHEN 'ITKO' THEN 'Tokyo (ITKO)' WHEN 'IMLR' THEN 'Mellor (IMLR)' WHEN 'IPPH' THEN 'Perth (IPPH)' ELSE origin END;
 destination:=CASE destination WHEN 'IRFD' THEN 'Rockford (IRFD)' WHEN 'ITKO' THEN 'Tokyo (ITKO)' WHEN 'IMLR' THEN 'Mellor (IMLR)' WHEN 'IPPH' THEN 'Perth (IPPH)' ELSE destination END;
 route:=origin||' → '||destination;
 IF nullif(p_plan->>'type_avion_id','') IS NOT NULL THEN SELECT nom INTO model FROM types_avion WHERE id=(p_plan->>'type_avion_id')::uuid; END IF;
 aircraft:=CASE WHEN nullif(model,'') IS NOT NULL THEN 'à bord d’un '||model ELSE 'par avion' END;
 arrival_time:=coalesce(nullif(p_plan->>'heure_arrivee_reelle','')::timestamptz,nullif(p_plan->>'demande_cloture_at','')::timestamptz,nullif(p_plan->>'cloture_at','')::timestamptz);
 departure_time:=coalesce(nullif(p_plan->>'heure_depart_reelle','')::timestamptz,nullif(p_plan->>'accepted_at','')::timestamptz);
 IF arrival_time IS NOT NULL AND departure_time IS NOT NULL AND arrival_time>=departure_time THEN elapsed:=round(extract(epoch FROM(arrival_time-departure_time))/60); END IF;
 duration:=CASE WHEN elapsed>0 AND elapsed<=1440 THEN elapsed::text||' minutes de vol' ELSE 'ce trajet aérien' END;
 arrival_clock:=CASE WHEN arrival_time IS NOT NULL THEN to_char(arrival_time AT TIME ZONE 'UTC','HH24:MI')||' UTC' ELSE 'l’heure de l’arrivée' END;
 arrival:=CASE WHEN arrival_time IS NOT NULL THEN 'à '||arrival_clock ELSE '' END;
 delay:=greatest(0,least(1440,(p_detail->>'delay_minutes')::numeric));
 IF p_detail->>'delay_minutes' IS NULL THEN delay:=NULL; END IF;
 tone:=CASE WHEN delay IS NULL OR delay>5 AND delay<=15 THEN 'mitige' WHEN delay<=5 THEN 'positif' ELSE 'negatif' END;
 cargo:=p_plan->>'nature_transport'='cargo' OR coalesce((p_plan->>'nb_pax_genere')::integer,0)=0;
 slot:=1+mod((p_sequence-1)::bigint+abs(hashtext(coalesce(p_plan->>'id',''))::bigint),30)::integer;
 opinion:=CASE tone WHEN 'positif' THEN positive[slot] WHEN 'mitige' THEN mixed[1+mod(slot-1,10)] ELSE negative[1+mod(slot-1,10)] END;
 timing:=CASE WHEN delay IS NULL THEN 'je ne fonde pas cet avis sur un horaire non renseigné.' WHEN delay<=5 THEN CASE mod(slot,4) WHEN 0 THEN 'l’arrivée est restée dans la tolérance prévue.' WHEN 1 THEN 'pas de retard important à l’arrivée.' WHEN 2 THEN 'l’arrivée est restée dans les cinq minutes de tolérance.' ELSE 'un vol ponctuel sur cette étape.' END WHEN delay<=15 THEN format('un décalage de %s minutes à l’arrivée, qui me laisse un avis partagé.',round(delay)) ELSE format('%s minutes de retard à l’arrivée : c’est trop pour un retour favorable.',round(delay)) END;
 IF NOT cargo THEN
   IF coalesce((p_detail->>'wifi_enabled')::boolean,false) THEN services:=CASE WHEN coalesce((p_detail->>'wifi_price')::numeric,0)=0 THEN 'Le Wi-Fi gratuit était proposé sur ce vol.' ELSE 'Une offre Wi-Fi était proposée à bord.' END; END IF;
   IF coalesce((p_detail->>'ife_level')::numeric,0)>0 THEN services:=concat_ws(' ',services,'Un programme de divertissement était aussi disponible.'); END IF;
 END IF;
 services:=coalesce(nullif(services,''),opinion);
 IF tone<>'positif' THEN passenger_templates[1]:='{company}, cette arrivée à {destination} va compter dans mes prochains choix. {Opinion}'; END IF;
 body:=CASE WHEN cargo THEN cargo_templates[slot] ELSE passenger_templates[slot] END;
 FOR item IN SELECT * FROM jsonb_each_text(jsonb_build_object('company',company,'origin',origin,'destination',destination,'route',route,'aircraft',aircraft,'duration',duration,'arrival',arrival,'arrival_clock',arrival_clock,'number',coalesce(nullif(p_plan->>'numero_vol',''),'de cette rotation'),'timing',timing,'opinion',opinion,'services',services,'short_verdict',CASE tone WHEN 'positif' THEN 'j’ai aimé ce vol.' WHEN 'mitige' THEN 'bof, pas complètement convaincu.' ELSE 'vraiment déçu de cette arrivée.' END,'Opinion',upper(left(opinion,1))||substr(opinion,2),'Timing',upper(left(timing,1))||substr(timing,2),'Services',upper(left(services,1))||substr(services,2),'load',coalesce((p_plan->>'cargo_kg_genere')::numeric,0)::text||' kg de fret')) LOOP body:=replace(body,'{'||item.key||'}',item.value); END LOOP;
 IF coalesce((p_detail->>'diverted')::boolean,false) AND mod(slot,5)=0 THEN body:=body||format(' Un déroutement a conduit ce vol vers %s.',destination); END IF;
 body:=trim(regexp_replace(body,'[ ]{2,}',' ','g'));
 author:=CASE WHEN cargo THEN 'Client fret virtuel · ' ELSE 'Voyageur virtuel · ' END||names[slot];
 RETURN jsonb_build_object('body',body,'author_label',author);
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
   label:=rendered->>'author_label';message:=rendered->>'body';
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

CREATE OR REPLACE FUNCTION public.restyle_flight_reviews(p_actor uuid,p_plan uuid) RETURNS jsonb
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
   UPDATE flight_reviews SET body=rendered->>'body',author_label=rendered->>'author_label' WHERE id=r.id AND (body IS DISTINCT FROM rendered->>'body' OR author_label IS DISTINCT FROM rendered->>'author_label');
   IF FOUND THEN changed:=changed+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'plan_id',p.id,'rewritten_count',changed,'retained_count',(SELECT count(*) FROM flight_reviews WHERE plan_id=p.id),'generated_count',p.review_generated_count,'count_unchanged',true,'reputation_unchanged',true);
END $$;
REVOKE ALL ON FUNCTION public.render_flight_review_voice(jsonb,jsonb,integer),public.write_flight_review_batch(uuid,jsonb,numeric,boolean),public.restyle_flight_reviews(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restyle_flight_reviews(uuid,uuid) TO service_role;
COMMIT;
