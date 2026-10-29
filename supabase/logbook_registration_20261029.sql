-- Enregistrement du carnet : une entrée suffit, quel que soit son statut staff.
-- Ne supprime, ne fusionne et ne rattache automatiquement aucun historique.
BEGIN;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS plan_vol_id uuid;
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
  WHERE c.conrelid='public.vols'::regclass AND c.confrelid='public.plans_vol'::regclass AND c.contype='f' AND a.attname='plan_vol_id'
 ) THEN
  -- NOT VALID preserves any historic orphan without relaxing checks on new links.
  ALTER TABLE public.vols ADD CONSTRAINT vols_logbook_source_plan_fkey FOREIGN KEY(plan_vol_id) REFERENCES public.plans_vol(id) ON DELETE SET NULL NOT VALID;
 END IF;
END $$;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS logbook_processed_at timestamptz;
CREATE INDEX IF NOT EXISTS vols_plan_vol_registration_idx ON public.vols(plan_vol_id) WHERE plan_vol_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.logbook_registration_fingerprint(p_pilot uuid,p_depart text,p_arrivee text,p_type text,p_callsign text,p_depart_at timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_pilot IS NULL OR p_depart_at IS NULL OR nullif(trim(p_depart),'') IS NULL OR nullif(trim(p_arrivee),'') IS NULL OR nullif(trim(p_type),'') IS NULL THEN NULL ELSE
  jsonb_build_array(p_pilot::text,upper(trim(p_depart)),upper(trim(p_arrivee)),upper(trim(p_type)),upper(regexp_replace(coalesce(p_callsign,''),'\s','','g')),to_char(p_depart_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI'))::text END;
$$;
-- Index non unique : les doublons historiques ne bloquent pas la migration.
-- Le hash borne la taille des clés ; l'égalité complète ci-dessous reste exigée.
CREATE INDEX IF NOT EXISTS vols_registration_fingerprint_idx ON public.vols((md5(public.logbook_registration_fingerprint(pilote_id,aeroport_depart,aeroport_arrivee,type_vol,callsign,depart_utc))));

-- A deleted/unlinked medical aircraft must not turn a reported mission into a
-- civil flight. The reports module is optional in a minimal installation.
CREATE OR REPLACE FUNCTION public.logbook_registration_is_dedicated(p_plan uuid,p_siavi_avion uuid,p_armee_mission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reported boolean:=false;
BEGIN
 IF p_siavi_avion IS NOT NULL OR nullif(btrim(p_armee_mission),'') IS NOT NULL THEN RETURN true; END IF;
 IF to_regclass('public.siavi_rapports_medevac') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.siavi_rapports_medevac WHERE plan_vol_id=$1)' INTO reported USING p_plan;
 END IF;
 RETURN coalesce(reported,false);
END $$;

CREATE OR REPLACE FUNCTION public.guard_logbook_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE signature text; old_signature text; source_plan public.plans_vol%ROWTYPE;
BEGIN
 signature:=logbook_registration_fingerprint(NEW.pilote_id,NEW.aeroport_depart,NEW.aeroport_arrivee,NEW.type_vol,NEW.callsign,NEW.depart_utc);
 IF TG_OP='UPDATE' THEN
  old_signature:=logbook_registration_fingerprint(OLD.pilote_id,OLD.aeroport_depart,OLD.aeroport_arrivee,OLD.type_vol,OLD.callsign,OLD.depart_utc);
  -- Des doublons historiques restent consultables et modifiables par le staff.
  IF old_signature IS NOT DISTINCT FROM signature AND OLD.plan_vol_id IS NOT DISTINCT FROM NEW.plan_vol_id THEN RETURN NEW; END IF;
  IF old_signature IS NOT DISTINCT FROM signature AND NEW.plan_vol_id IS NULL THEN RETURN NEW; END IF;
 END IF;
 -- Même ordre dans le RPC et le trigger : plan, puis empreinte.
 IF NEW.plan_vol_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('logbook-plan:'||NEW.plan_vol_id::text,0)); END IF;
 IF signature IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('logbook-flight:'||signature,0)); END IF;
 IF NEW.plan_vol_id IS NOT NULL THEN
  SELECT * INTO source_plan FROM public.plans_vol WHERE id=NEW.plan_vol_id FOR UPDATE;
  IF NOT FOUND OR source_plan.pilote_id IS DISTINCT FROM NEW.pilote_id THEN RAISE EXCEPTION 'Le plan source ne correspond pas au pilote du carnet.' USING ERRCODE='P0001'; END IF;
  IF source_plan.statut IS DISTINCT FROM 'cloture' OR source_plan.accepted_at IS NULL OR source_plan.cloture_at IS NULL THEN RAISE EXCEPTION 'Le plan source doit être clôturé.' USING ERRCODE='P0001'; END IF;
  IF logbook_registration_is_dedicated(source_plan.id,source_plan.siavi_avion_id,source_plan.armee_mission_id::text) THEN RAISE EXCEPTION 'Cette mission se traite dans son espace dédié.' USING ERRCODE='P0001'; END IF;
  IF source_plan.logbook_processed_at IS NOT NULL THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Ce plan a déjà été enregistré ou écarté.' USING ERRCODE='23505'; END IF;
   IF OLD.plan_vol_id IS DISTINCT FROM NEW.plan_vol_id THEN RAISE EXCEPTION 'Ce plan a déjà été enregistré ou écarté.' USING ERRCODE='23505'; END IF;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.vols v WHERE v.id IS DISTINCT FROM NEW.id AND
  ((NEW.plan_vol_id IS NOT NULL AND v.plan_vol_id=NEW.plan_vol_id) OR
   (signature IS NOT NULL AND md5(logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc))=md5(signature) AND logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc)=signature))) THEN
  RAISE EXCEPTION 'Ce vol est déjà enregistré dans le carnet, même s’il attend la validation du staff.' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.mark_logbook_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.plan_vol_id IS NOT NULL THEN
  UPDATE public.plans_vol SET logbook_processed_at=coalesce(logbook_processed_at,now()) WHERE id=NEW.plan_vol_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_logbook_registration ON public.vols;
CREATE TRIGGER guard_logbook_registration BEFORE INSERT OR UPDATE OF plan_vol_id,pilote_id,aeroport_depart,aeroport_arrivee,type_vol,callsign,depart_utc ON public.vols FOR EACH ROW EXECUTE FUNCTION public.guard_logbook_registration();
DROP TRIGGER IF EXISTS mark_logbook_registration ON public.vols;
CREATE TRIGGER mark_logbook_registration AFTER INSERT OR UPDATE OF plan_vol_id ON public.vols FOR EACH ROW EXECUTE FUNCTION public.mark_logbook_registration();

CREATE OR REPLACE FUNCTION public.register_logbook_flight(p_actor uuid,p_row jsonb,p_plan_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles%ROWTYPE; candidate public.vols%ROWTYPE; source_plan public.plans_vol%ROWTYPE;
 existing public.vols%ROWTYPE; signature text; source_signature text; safe_row jsonb; inserted_id uuid; inserted_statut text; columns_sql text; values_sql text;
 allowed text[]:=ARRAY['pilote_id','copilote_id','copilote_confirme_par_pilote','type_avion_id','compagnie_id','compagnie_libelle','aeroport_depart','aeroport_arrivee','duree_minutes','depart_utc','arrivee_utc','type_vol','instructeur_id','instruction_type','commandant_bord','role_pilote','callsign','statut','created_by_admin','created_by_user_id'];
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',403,'code','ACTOR_REQUIRED','error','Compte pilote introuvable.'); END IF;
 IF p_row IS NULL OR jsonb_typeof(p_row)<>'object' THEN RETURN jsonb_build_object('ok',false,'status',400,'code','INVALID_ROW','error','Informations du vol invalides.'); END IF;
 candidate:=jsonb_populate_record(NULL::public.vols,p_row);
 IF candidate.pilote_id IS NULL OR candidate.depart_utc IS NULL OR candidate.duree_minutes IS NULL OR candidate.duree_minutes<1 OR candidate.type_vol NOT IN ('IFR','VFR','Instruction') THEN
  RETURN jsonb_build_object('ok',false,'status',400,'code','INVALID_FLIGHT','error','Informations du vol incomplètes ou invalides.');
 END IF;
 IF actor.role IS DISTINCT FROM 'admin' AND p_actor IS DISTINCT FROM candidate.pilote_id AND p_actor IS DISTINCT FROM candidate.copilote_id THEN
  RETURN jsonb_build_object('ok',false,'status',403,'code','ACTOR_NOT_CREW','error','Vous ne pouvez pas enregistrer ce vol pour cet équipage.');
 END IF;
 IF actor.role IS DISTINCT FROM 'admin' AND candidate.statut='validé' THEN RETURN jsonb_build_object('ok',false,'status',403,'code','STAFF_VALIDATION_REQUIRED','error','La validation de ce vol appartient au staff.'); END IF;
 signature:=logbook_registration_fingerprint(candidate.pilote_id,candidate.aeroport_depart,candidate.aeroport_arrivee,candidate.type_vol,candidate.callsign,candidate.depart_utc);
 IF signature IS NULL THEN RETURN jsonb_build_object('ok',false,'status',400,'code','INVALID_FLIGHT','error','Route et horaires du vol requis.'); END IF;
 IF p_plan_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('logbook-plan:'||p_plan_id::text,0)); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('logbook-flight:'||signature,0));
 IF p_plan_id IS NOT NULL THEN
  SELECT * INTO source_plan FROM public.plans_vol WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','SOURCE_NOT_FOUND','error','Plan source introuvable.'); END IF;
  IF source_plan.pilote_id IS DISTINCT FROM candidate.pilote_id THEN RETURN jsonb_build_object('ok',false,'status',403,'code','SOURCE_NOT_OWNED','error','Le plan source ne correspond pas au pilote du carnet.'); END IF;
  IF actor.role IS DISTINCT FROM 'admin' AND p_actor IS DISTINCT FROM source_plan.pilote_id AND p_actor IS DISTINCT FROM source_plan.copilote_id THEN RETURN jsonb_build_object('ok',false,'status',403,'code','SOURCE_NOT_CREW','error','Vous ne faites pas partie de l’équipage de ce plan.'); END IF;
  IF source_plan.statut IS DISTINCT FROM 'cloture' OR source_plan.accepted_at IS NULL OR source_plan.cloture_at IS NULL THEN RETURN jsonb_build_object('ok',false,'status',409,'code','SOURCE_NOT_CLOSED','error','Le plan source doit être clôturé avant l’enregistrement.'); END IF;
  IF logbook_registration_is_dedicated(source_plan.id,source_plan.siavi_avion_id,source_plan.armee_mission_id::text) THEN RETURN jsonb_build_object('ok',false,'status',400,'code','DEDICATED_MISSION','error','Cette mission se traite dans son espace dédié.'); END IF;
  source_signature:=logbook_registration_fingerprint(source_plan.pilote_id,source_plan.aeroport_depart,source_plan.aeroport_arrivee,source_plan.type_vol,source_plan.numero_vol,source_plan.accepted_at);
 END IF;
 SELECT * INTO existing FROM public.vols v WHERE
  (p_plan_id IS NOT NULL AND v.plan_vol_id=p_plan_id) OR
  (md5(logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc))=md5(signature) AND logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc)=signature)
 ORDER BY CASE WHEN p_plan_id IS NOT NULL AND v.plan_vol_id=p_plan_id THEN 0 ELSE 1 END,v.created_at ASC NULLS LAST,v.id LIMIT 1;
 IF FOUND THEN
  -- L'équipage soumis n'autorise pas à découvrir une fiche existante : seul
  -- l'équipage réellement enregistré, son instructeur ou un admin peut la lire.
  IF actor.role IS DISTINCT FROM 'admin' AND p_actor IS DISTINCT FROM existing.pilote_id AND p_actor IS DISTINCT FROM existing.copilote_id AND p_actor IS DISTINCT FROM existing.instructeur_id THEN
   RETURN jsonb_build_object('ok',false,'status',409,'code','EXISTING_CREW_REQUIRED','error','Ce vol a déjà été transmis par son équipage. Faites corriger la fiche existante.');
  END IF;
  IF p_plan_id IS NOT NULL THEN
   IF existing.plan_vol_id IS DISTINCT FROM p_plan_id AND source_signature IS DISTINCT FROM signature THEN RETURN jsonb_build_object('ok',false,'status',409,'code','SOURCE_MISMATCH','error','Ce vol est déjà enregistré, mais ne correspond pas au plan source choisi.'); END IF;
   UPDATE public.plans_vol SET logbook_processed_at=coalesce(logbook_processed_at,now()) WHERE id=p_plan_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'duplicate',true,'plan_id',p_plan_id,'statut',existing.statut);
 END IF;
 IF p_plan_id IS NOT NULL AND source_plan.logbook_processed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'status',409,'code','SOURCE_PROCESSED','error','Ce plan a déjà été enregistré ou écarté. Consultez le carnet.'); END IF;
 -- Seules les colonnes prévues sont insérées ; les ID/dates et futurs champs
 -- absents gardent leurs DEFAULT au lieu d'être écrasés par les NULL du record.
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO safe_row FROM jsonb_each(p_row) WHERE key=ANY(allowed);
 safe_row:=safe_row||jsonb_build_object('plan_vol_id',p_plan_id,'created_by_admin',coalesce(candidate.created_by_admin,false) AND actor.role='admin','created_by_user_id',CASE WHEN coalesce(candidate.created_by_admin,false) AND actor.role='admin' THEN p_actor ELSE NULL END);
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key) INTO columns_sql,values_sql FROM jsonb_object_keys(safe_row) key;
 EXECUTE format('INSERT INTO public.vols(%s) SELECT %s FROM jsonb_populate_record(NULL::public.vols,$1) r RETURNING id,statut::text',columns_sql,values_sql) USING safe_row INTO inserted_id,inserted_statut;
 RETURN jsonb_build_object('ok',true,'id',inserted_id,'duplicate',false,'plan_id',p_plan_id,'statut',inserted_statut);
EXCEPTION
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'status',400,'code','INVALID_ROW','error','Informations du vol invalides.');
END $$;

CREATE OR REPLACE FUNCTION public.get_unrecorded_closed_plans(p_pilot uuid,p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,aeroport_depart text,aeroport_arrivee text,type_vol text,numero_vol text,temps_prev_min integer,accepted_at timestamptz,cloture_at timestamptz,available_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_pilot IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN RAISE EXCEPTION 'Sélection des plans invalide.' USING ERRCODE='P0001'; END IF;
 RETURN QUERY WITH available AS (
  SELECT p.* FROM public.plans_vol p WHERE p.pilote_id=p_pilot AND p.statut='cloture' AND p.logbook_processed_at IS NULL
   AND NOT logbook_registration_is_dedicated(p.id,p.siavi_avion_id,p.armee_mission_id::text) AND p.accepted_at IS NOT NULL AND p.cloture_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.vols v WHERE v.plan_vol_id=p.id OR
    (md5(logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc))=md5(logbook_registration_fingerprint(p.pilote_id,p.aeroport_depart,p.aeroport_arrivee,p.type_vol,p.numero_vol,p.accepted_at)) AND
     logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc)=
     logbook_registration_fingerprint(p.pilote_id,p.aeroport_depart,p.aeroport_arrivee,p.type_vol,p.numero_vol,p.accepted_at)))
 ) SELECT a.id,a.aeroport_depart::text,a.aeroport_arrivee::text,a.type_vol::text,a.numero_vol::text,a.temps_prev_min,a.accepted_at,a.cloture_at,count(*) OVER()
 FROM available a ORDER BY a.cloture_at DESC,a.id LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION public.logbook_registration_fingerprint(uuid,text,text,text,text,timestamptz),public.logbook_registration_is_dedicated(uuid,uuid,text),public.guard_logbook_registration(),public.mark_logbook_registration(),public.register_logbook_flight(uuid,jsonb,uuid),public.get_unrecorded_closed_plans(uuid,integer) FROM PUBLIC,anon,authenticated;
-- Fonction pure, sans lecture de données : nécessaire à la maintenance de l'index
-- lors des écritures ordinaires autorisées par les politiques RLS existantes.
GRANT EXECUTE ON FUNCTION public.logbook_registration_fingerprint(uuid,text,text,text,text,timestamptz) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_logbook_flight(uuid,jsonb,uuid),public.get_unrecorded_closed_plans(uuid,integer) TO service_role;
COMMENT ON COLUMN public.vols.plan_vol_id IS 'Plan source du carnet, dès enregistrement et indépendamment du statut de validation staff';
NOTIFY pgrst, 'reload schema';
COMMIT;
