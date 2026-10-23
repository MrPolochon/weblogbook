-- À appliquer après ifsa_payments_and_audit.sql. Aucun changement de barème.
BEGIN;
CREATE OR REPLACE FUNCTION public.submit_medevac_report(p_plan_id uuid,p_author_id uuid,p_report jsonb,p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE
 v_origin jsonb;
 v_plan public.plans_vol%ROWTYPE; v_avion record; v_existing record; v_report record;
 v_ids uuid[]; v_member record; v_participants jsonb := '[]'::jsonb; v_payout jsonb;
 v_count integer; v_minutes numeric; v_gross bigint; v_siavi bigint; v_pool bigint; v_share bigint;
 v_account uuid; v_siavi_account uuid; v_i integer := 0; v_amount bigint; v_new_pay boolean;
BEGIN
 SELECT * INTO v_plan FROM public.plans_vol WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND OR v_plan.siavi_avion_id IS NULL OR v_plan.statut<>'cloture' OR v_plan.medevac_next_plan_id IS NOT NULL THEN RAISE EXCEPTION 'Mission MEDEVAC finale clôturée requise'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_author_id AND (role::text='admin' OR role::text='siavi' OR siavi IS TRUE)) THEN RAISE EXCEPTION 'Accès SIAVI requis'; END IF;
 IF v_plan.pilote_id<>p_author_id AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_author_id AND role::text='admin') THEN RAISE EXCEPTION 'Seul le pilote ou un administrateur peut déposer ce rapport'; END IF;
 SELECT r.id,r.numero_mission INTO v_existing FROM siavi_rapports_medevac r JOIN plans_vol p ON p.id=r.plan_vol_id
 WHERE p.id=v_plan.id OR (v_plan.medevac_mission_id IS NOT NULL AND p.medevac_mission_id=v_plan.medevac_mission_id) LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'id',v_existing.id,'numero_mission',v_existing.numero_mission,'already_submitted',true); END IF;
 IF nullif(btrim(p_report->>'commander'),'') IS NULL OR nullif(btrim(p_report->>'medical_summary'),'') IS NULL OR nullif(btrim(p_report->>'outcome'),'') IS NULL THEN RAISE EXCEPTION 'Rapport incomplet'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(coalesce(p_participant_ids,'{}'::uuid[])||ARRAY[v_plan.pilote_id]) x WHERE x IS NOT NULL;
 v_count:=cardinality(v_ids);
 IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION 'Équipage invalide'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_ids) x LEFT JOIN profiles p ON p.id=x WHERE p.id IS NULL OR NOT (p.role::text IN ('siavi','admin') OR p.siavi IS TRUE)) THEN RAISE EXCEPTION 'Tous les participants doivent être agents SIAVI'; END IF;
 SELECT a.immatriculation,t.nom,t.categorie INTO v_avion FROM siavi_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.id=v_plan.siavi_avion_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aéronef SIAVI introuvable'; END IF;
 -- Duration comes from stored flight timestamps, never from form or medical narrative.
 SELECT coalesce(sum(greatest(0,extract(epoch FROM (coalesce(p.demande_cloture_at,p.cloture_at)-coalesce(p.heure_depart_reelle,p.accepted_at)))/60)),0)
 INTO v_minutes FROM plans_vol p WHERE (p.id=v_plan.id OR (v_plan.medevac_mission_id IS NOT NULL AND p.medevac_mission_id=v_plan.medevac_mission_id)) AND p.statut='cloture';
 v_new_pay:=v_plan.medevac_remuneration_version=2;
 IF v_new_pay THEN
  v_gross:=public.medevac_mission_revenue(v_minutes,v_avion.categorie='helicoptere');
  v_siavi:=v_gross/2; v_pool:=v_gross-v_siavi; v_share:=v_pool/v_count;
  SELECT id INTO v_siavi_account FROM felitz_comptes WHERE type='siavi' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF v_siavi_account IS NULL THEN RAISE EXCEPTION 'Compte SIAVI introuvable'; END IF;
  UPDATE felitz_comptes SET solde=solde+v_siavi WHERE id=v_siavi_account;
  v_origin:=jsonb_build_object('plan_vol_id',v_plan.id,'mission_id',v_plan.medevac_mission_id,'numero_vol',v_plan.numero_vol,'pilote_id',v_plan.pilote_id,'aeroport_depart',v_plan.aeroport_depart,'aeroport_arrivee',v_plan.aeroport_arrivee,'revenu_total',v_gross,'snapshot_at',now());
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle,flight_origin) VALUES(v_siavi_account,'credit',v_siavi,'Mission MEDEVAC '||v_plan.numero_vol||' · part SIAVI 50%',v_origin);
  v_payout:=jsonb_build_object('version',2,'duree_minutes',round(v_minutes,2),'categorie',v_avion.categorie,'revenu_total',v_gross,'part_siavi',v_siavi,'part_equipage',v_pool);
 ELSE
  v_payout:=jsonb_build_object('version',1,'legacy',true,'message','Mission antérieure : rémunération selon l’ancien barème, sans second versement.');
 END IF;
 -- Deterministic UUID order keeps concurrent crew/account locks consistent.
 FOR v_member IN SELECT id,identifiant FROM profiles WHERE id=ANY(v_ids) ORDER BY id LOOP
  v_amount:=0;
  IF v_new_pay THEN
   PERFORM 1 FROM profiles WHERE id=v_member.id FOR UPDATE;
   SELECT id INTO v_account FROM felitz_comptes WHERE type='personnel' AND proprietaire_id=v_member.id ORDER BY created_at,id LIMIT 1 FOR UPDATE;
   IF v_account IS NULL THEN
    INSERT INTO felitz_comptes(type,proprietaire_id,vban,solde) VALUES('personnel',v_member.id,'MIXOU'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,22)),0) RETURNING id INTO v_account;
   END IF;
   v_amount:=v_share+CASE WHEN v_i<(v_pool%v_count) THEN 1 ELSE 0 END;
   UPDATE felitz_comptes SET solde=solde+v_amount WHERE id=v_account;
   INSERT INTO felitz_transactions(compte_id,type,montant,libelle,flight_origin) VALUES(v_account,'credit',v_amount,'Salaire équipage MEDEVAC '||v_plan.numero_vol,v_origin || jsonb_build_object('beneficiaire_id',v_member.id,'montant',v_amount));
  END IF;
  v_participants:=v_participants||jsonb_build_array(jsonb_build_object('id',v_member.id,'identifiant',v_member.identifiant,'montant',v_amount)); v_i:=v_i+1;
 END LOOP;
 INSERT INTO siavi_rapports_medevac(plan_vol_id,date_mission,operator_base,aircraft_registration,aircraft_type,aircraft_role,commander,co_pilot,medical_team,mission_timeline,medical_summary,ground_event,outcome,safety_remarks,created_by,participants,remuneration)
 VALUES(p_plan_id,current_date,v_plan.aeroport_depart,v_avion.immatriculation,v_avion.nom,'Medical transport configuration',btrim(p_report->>'commander'),nullif(btrim(p_report->>'co_pilot'),''),nullif(btrim(p_report->>'medical_team'),''),coalesce(p_report->'mission_timeline','[]'::jsonb),btrim(p_report->>'medical_summary'),nullif(btrim(p_report->>'ground_event'),''),btrim(p_report->>'outcome'),nullif(btrim(p_report->>'safety_remarks'),''),p_author_id,v_participants,v_payout)
 RETURNING id,numero_mission INTO v_report;
 RETURN jsonb_build_object('ok',true,'id',v_report.id,'numero_mission',v_report.numero_mission,'remuneration',v_payout,'participants',v_participants);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_medevac_report(uuid,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_medevac_report(uuid,uuid,jsonb,uuid[]) TO service_role;
COMMIT;
