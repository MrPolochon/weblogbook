-- LOCAL PREPARATION ONLY. Apply on a test copy before production.
-- All migrations share one transaction: any failure rolls back the bundle.
BEGIN;

-- Source: supabase/logbook_registration_20261029.sql
-- SHA-256: 6a85f309f109e0ebfb751f15d3f69335582415c803a447fb25c07c4cd0fb0370
-- Enregistrement du carnet : une entrée suffit, quel que soit son statut staff.
-- Ne supprime, ne fusionne et ne rattache automatiquement aucun historique.
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
CREATE OR REPLACE FUNCTION public.logbook_registration_is_dedicated(p_plan uuid,p_siavi_avion uuid,p_armee_mission uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reported boolean:=false;
BEGIN
 IF p_siavi_avion IS NOT NULL OR p_armee_mission IS NOT NULL THEN RETURN true; END IF;
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
  IF logbook_registration_is_dedicated(source_plan.id,source_plan.siavi_avion_id,source_plan.armee_mission_id) THEN RAISE EXCEPTION 'Cette mission se traite dans son espace dédié.' USING ERRCODE='P0001'; END IF;
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
  IF logbook_registration_is_dedicated(source_plan.id,source_plan.siavi_avion_id,source_plan.armee_mission_id) THEN RETURN jsonb_build_object('ok',false,'status',400,'code','DEDICATED_MISSION','error','Cette mission se traite dans son espace dédié.'); END IF;
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
   AND NOT logbook_registration_is_dedicated(p.id,p.siavi_avion_id,p.armee_mission_id) AND p.accepted_at IS NOT NULL AND p.cloture_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.vols v WHERE v.plan_vol_id=p.id OR
    (md5(logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc))=md5(logbook_registration_fingerprint(p.pilote_id,p.aeroport_depart,p.aeroport_arrivee,p.type_vol,p.numero_vol,p.accepted_at)) AND
     logbook_registration_fingerprint(v.pilote_id,v.aeroport_depart,v.aeroport_arrivee,v.type_vol,v.callsign,v.depart_utc)=
     logbook_registration_fingerprint(p.pilote_id,p.aeroport_depart,p.aeroport_arrivee,p.type_vol,p.numero_vol,p.accepted_at)))
 ) SELECT a.id,a.aeroport_depart::text,a.aeroport_arrivee::text,a.type_vol::text,a.numero_vol::text,a.temps_prev_min,a.accepted_at,a.cloture_at,count(*) OVER()
 FROM available a ORDER BY a.cloture_at DESC,a.id LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION public.logbook_registration_fingerprint(uuid,text,text,text,text,timestamptz),public.logbook_registration_is_dedicated(uuid,uuid,uuid),public.guard_logbook_registration(),public.mark_logbook_registration(),public.register_logbook_flight(uuid,jsonb,uuid),public.get_unrecorded_closed_plans(uuid,integer) FROM PUBLIC,anon,authenticated;
-- Fonction pure, sans lecture de données : nécessaire à la maintenance de l'index
-- lors des écritures ordinaires autorisées par les politiques RLS existantes.
GRANT EXECUTE ON FUNCTION public.logbook_registration_fingerprint(uuid,text,text,text,text,timestamptz) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_logbook_flight(uuid,jsonb,uuid),public.get_unrecorded_closed_plans(uuid,integer) TO service_role;
COMMENT ON COLUMN public.vols.plan_vol_id IS 'Plan source du carnet, dès enregistrement et indépendamment du statut de validation staff';
NOTIFY pgrst, 'reload schema';



-- Source: supabase/logbook_staff_validation_20261029.sql
-- SHA-256: d375a206565c3dc9f1045b3236c807cb512494a96e0e4cbca7c0008fbb0bcde2
-- Validation du carnet et racine de confiance des profils.
-- Aucun changement des vols/profils historiques. Appliquer avant l'activation.

CREATE OR REPLACE FUNCTION public.logbook_is_privileged_writer()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE db_role text:=coalesce(current_setting('role',true),'none');
BEGIN
 -- Le rôle effectivement endossé par PostgreSQL prime sur le contenu du JWT.
 -- Une valeur fournie dans le corps d'une requête n'accorde aucun privilège.
 IF db_role IN ('service_role','postgres','supabase_admin') THEN RETURN true; END IF;
 IF db_role='none' AND session_user IN ('postgres','supabase_admin') THEN RETURN true; END IF;
 IF db_role<>'authenticated' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin');
END $$;

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_row jsonb:=to_jsonb(NEW); previous_row jsonb; key text;
 protected text[]:=ARRAY['role','armee','atc','siavi','ifsa','ground_crew','atc_grade_id','siavi_grade_id','admin_role_ids','heures_initiales_minutes','blocked_until','block_reason','sanction_blocage_vol','sanction_blocage_motif','sanction_blocage_jusqu_au'];
BEGIN
 IF logbook_is_privileged_writer() THEN RETURN NEW; END IF;
 IF coalesce(current_setting('role',true),'none')<>'authenticated' OR auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Modification du profil non autorisée.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  FOREACH key IN ARRAY protected LOOP
   IF NOT next_row ? key THEN CONTINUE; END IF;
   IF key='role' THEN
    IF next_row->>key IS DISTINCT FROM 'pilote' THEN RAISE EXCEPTION 'Les habilitations du profil sont attribuées par le serveur.' USING ERRCODE='42501'; END IF;
   ELSIF next_row->key NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'[]'::jsonb) THEN
    RAISE EXCEPTION 'Les habilitations et sanctions du profil sont attribuées par le serveur.' USING ERRCODE='42501';
   END IF;
  END LOOP;
 ELSE
  previous_row:=to_jsonb(OLD);
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Identité du profil non modifiable.' USING ERRCODE='42501'; END IF;
  FOREACH key IN ARRAY protected LOOP
   IF next_row->key IS DISTINCT FROM previous_row->key THEN
    RAISE EXCEPTION 'Les habilitations, heures initiales et sanctions ne sont pas modifiables directement.' USING ERRCODE='42501';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_logbook_staff_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE next_row jsonb:=to_jsonb(NEW); previous_row jsonb; key text;
 protected text[]:=ARRAY['copilote_id','copilote_confirme_par_pilote','instructeur_id','instruction_type','created_by_admin','created_by_user_id','refusal_count','refusal_reason','editing_by_pilot_id','editing_started_at','chef_escadron_id'];
BEGIN
 IF logbook_is_privileged_writer() THEN RETURN NEW; END IF;
 IF coalesce(current_setting('role',true),'none')<>'authenticated' OR auth.uid() IS NULL OR NEW.pilote_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Écriture du carnet non autorisée.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.statut IS DISTINCT FROM 'en_attente' OR NEW.type_vol NOT IN ('IFR','VFR') THEN
   RAISE EXCEPTION 'Un vol doit être transmis pour validation ; les décisions et confirmations appartiennent au serveur.' USING ERRCODE='42501';
  END IF;
  FOREACH key IN ARRAY protected LOOP
   IF next_row ? key AND next_row->key NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb) THEN
    RAISE EXCEPTION 'Les données de validation et d’équipage sont contrôlées par le serveur.' USING ERRCODE='42501';
   END IF;
  END LOOP;
  FOR key IN SELECT jsonb_object_keys(next_row) LOOP
   IF key LIKE 'mission\_%' ESCAPE '\' AND next_row->key NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'[]'::jsonb) THEN
    RAISE EXCEPTION 'Les récompenses de mission sont contrôlées par le serveur.' USING ERRCODE='42501';
   END IF;
  END LOOP;
 ELSE
  previous_row:=to_jsonb(OLD);
  IF OLD.pilote_id IS DISTINCT FROM auth.uid() OR OLD.statut NOT IN ('en_attente','refusé') OR OLD.type_vol='Vol militaire' THEN
   RAISE EXCEPTION 'Ce vol ne peut être modifié que par le parcours autorisé.' USING ERRCODE='42501';
  END IF;
  IF OLD.statut='refusé' AND coalesce((previous_row->>'refusal_count')::integer,0)>=3 THEN
   RAISE EXCEPTION 'Ce vol a été refusé trois fois et ne peut plus être corrigé directement.' USING ERRCODE='42501';
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND NOT (OLD.statut='refusé' AND NEW.statut='en_attente') THEN
   RAISE EXCEPTION 'La validation, le refus et les confirmations appartiennent au serveur.' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.pilote_id IS DISTINCT FROM OLD.pilote_id OR next_row->'created_at' IS DISTINCT FROM previous_row->'created_at' THEN
   RAISE EXCEPTION 'L’identité et la création du vol ne sont pas modifiables directement.' USING ERRCODE='42501';
  END IF;
  IF NEW.type_vol IS DISTINCT FROM OLD.type_vol AND NEW.type_vol NOT IN ('IFR','VFR') THEN
   RAISE EXCEPTION 'Le type de mission doit être contrôlé par le serveur.' USING ERRCODE='42501';
  END IF;
  FOREACH key IN ARRAY protected LOOP
   IF next_row->key IS DISTINCT FROM previous_row->key THEN RAISE EXCEPTION 'Les données de validation et d’équipage sont contrôlées par le serveur.' USING ERRCODE='42501'; END IF;
  END LOOP;
  FOR key IN SELECT jsonb_object_keys(next_row) LOOP
   IF key LIKE 'mission\_%' ESCAPE '\' AND next_row->key IS DISTINCT FROM previous_row->key THEN RAISE EXCEPTION 'Les récompenses de mission sont contrôlées par le serveur.' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_privileged_fields ON public.profiles;
CREATE TRIGGER guard_profile_privileged_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();
DROP TRIGGER IF EXISTS guard_logbook_staff_validation ON public.vols;
CREATE TRIGGER guard_logbook_staff_validation BEFORE INSERT OR UPDATE ON public.vols FOR EACH ROW EXECUTE FUNCTION public.guard_logbook_staff_validation();
REVOKE ALL ON FUNCTION public.logbook_is_privileged_writer(),public.guard_profile_privileged_fields(),public.guard_logbook_staff_validation() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';



-- Source: supabase/flight_submission_integrity_20261029.sql
-- SHA-256: 6bc01bfa8a50fd7da9832ec281a881c94f0c558ad0eecf0ab8d089c2e12e7b99
-- CURRENT economy hardening only. No November research/economy features are enabled.
-- Install before deploying the API. Missing functions deliberately fail closed (HTTP 503).
CREATE TABLE IF NOT EXISTS public.flight_submission_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  utc_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  version integer NOT NULL DEFAULT 1,
  scope jsonb NOT NULL,
  draw jsonb NOT NULL,
  pricing jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id, utc_day, version, scope)
);
ALTER TABLE public.flight_submission_quotes ADD COLUMN IF NOT EXISTS pricing jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.flight_submission_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flight_submission_quotes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flight_submission_quotes TO service_role;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS flight_submission_quote_id uuid REFERENCES public.flight_submission_quotes(id);
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS flight_stock_released_at timestamptz;

-- Recheck identity inside the database, including non-commercial company flights.
CREATE OR REPLACE FUNCTION public.authorize_flight_submission(p_actor uuid, p_scope jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c uuid := (p_scope->>'compagnie_id')::uuid; a uuid := (p_scope->>'compagnie_avion_id')::uuid;
  personal uuid := (p_scope->>'inventaire_avion_id')::uuid; owner uuid;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Pilote requis'; END IF;
  IF c IS NOT NULL THEN
    SELECT pdg_id INTO owner FROM compagnies WHERE id=c FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compagnie introuvable'; END IF;
    IF owner IS DISTINCT FROM p_actor THEN
      PERFORM 1 FROM compagnie_employes WHERE compagnie_id=c AND pilote_id=p_actor FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Vous n’appartenez pas à cette compagnie'; END IF;
    END IF;
  END IF;
  IF ((p_scope->>'vol_commercial')::boolean OR (p_scope->>'vol_ferry')::boolean OR a IS NOT NULL OR c IS NOT NULL)
      AND (c IS NULL OR a IS NULL) THEN RAISE EXCEPTION 'Compagnie et appareil requis'; END IF;
  IF personal IS NOT NULL THEN
    IF c IS NOT NULL OR a IS NOT NULL THEN RAISE EXCEPTION 'Appareils incompatibles'; END IF;
    SELECT proprietaire_id INTO owner FROM inventaire_avions WHERE id=personal FOR SHARE;
    IF NOT FOUND OR owner IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Cet appareil personnel ne vous appartient pas'; END IF;
    IF EXISTS(SELECT 1 FROM inventaire_avions i WHERE i.id=personal AND
      (coalesce((to_jsonb(i)->>'detruit')::boolean,false) OR
       NOT coalesce((to_jsonb(i)->>'disponible')::boolean,true) OR
       (coalesce((to_jsonb(i)->>'instruction_actif')::boolean,false) AND coalesce(to_jsonb(i)->>'instruction_lifecycle','actif') <> 'actif')))
      THEN RAISE EXCEPTION 'Appareil personnel indisponible'; END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.flight_submission_pricing(p_scope jsonb, p_draw jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c compagnies%ROWTYPE; ticket numeric := 0; kg numeric := 0; revenue numeric := 0; salary numeric := 0;
  special numeric; pax integer := coalesce((p_draw->>'nb_pax_genere')::integer,0);
  cargo integer := coalesce((p_draw->>'cargo_kg_genere')::integer,0); bonus numeric := coalesce((p_draw->>'cargo_bonus_percent')::numeric,0);
BEGIN
  IF coalesce((p_scope->>'vol_commercial')::boolean,false) THEN
    SELECT * INTO c FROM compagnies WHERE id=(p_scope->>'compagnie_id')::uuid FOR SHARE;
    ticket := greatest(0,coalesce(c.prix_billet_pax,0)); kg := greatest(0,coalesce(c.prix_kg_cargo,0));
    SELECT prix_billet INTO special FROM tarifs_liaisons WHERE compagnie_id=c.id AND aeroport_depart=p_scope->>'aeroport_depart' AND aeroport_arrivee=p_scope->>'aeroport_arrivee' FOR SHARE;
    IF FOUND THEN ticket := greatest(0,coalesce(special,0)); END IF;
    revenue := pax*ticket + round(cargo*kg*(1+bonus/100));
    salary := floor(revenue*greatest(0,least(100,coalesce(c.pourcentage_salaire,0)))/100);
    IF p_scope->>'nature_transport'='cargo' THEN ticket:=kg; END IF;
  END IF;
  RETURN jsonb_build_object('nb_pax_genere',pax,'cargo_kg_genere',cargo,'revenue_brut',revenue,'salaire_pilote',salary,
    'prix_billet_utilise',ticket,'prix_kg_cargo_utilise',kg,'type_cargaison',p_draw->'type_cargaison','type_cargaison_libelle',p_draw->'type_cargaison_libelle');
END $$;

CREATE OR REPLACE FUNCTION public.get_flight_submission_quote(p_actor uuid,p_scope jsonb,p_candidate jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q flight_submission_quotes%ROWTYPE; aircraft compagnie_avions%ROWTYPE; capacity types_avion%ROWTYPE;
  day date := (now() AT TIME ZONE 'UTC')::date; pax integer; cargo integer; pricing jsonb;
BEGIN
  PERFORM authorize_flight_submission(p_actor,p_scope);
  -- Neither callsign, ETD nor plan id participates in this draw key.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||day::text||p_scope::text||':v1',0));
  SELECT * INTO q FROM flight_submission_quotes WHERE actor_id=p_actor AND utc_day=day AND version=1 AND scope=p_scope;
  IF NOT FOUND THEN
    pax := coalesce((p_candidate->>'nb_pax_genere')::integer,0); cargo := coalesce((p_candidate->>'cargo_kg_genere')::integer,0);
    IF pax<0 OR cargo<0 THEN RAISE EXCEPTION 'Chargement invalide'; END IF;
    IF coalesce((p_scope->>'vol_commercial')::boolean,false) THEN
      SELECT * INTO aircraft FROM compagnie_avions WHERE id=(p_scope->>'compagnie_avion_id')::uuid FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Appareil introuvable'; END IF;
      IF aircraft.compagnie_id IS DISTINCT FROM (p_scope->>'compagnie_id')::uuid AND NOT EXISTS (
        SELECT 1 FROM compagnie_locations WHERE avion_id=aircraft.id AND locataire_compagnie_id=(p_scope->>'compagnie_id')::uuid AND statut='active' AND start_at<=now() AND end_at>=now()
      ) THEN RAISE EXCEPTION 'Cet appareil n’est pas disponible pour cette compagnie'; END IF;
      SELECT * INTO capacity FROM types_avion WHERE id=aircraft.type_avion_id FOR SHARE;
      IF pax>coalesce(capacity.capacite_pax,0) OR cargo>coalesce(capacity.capacite_cargo_kg,0) THEN RAISE EXCEPTION 'Capacité de l’appareil dépassée'; END IF;
      IF p_scope->>'nature_transport'='cargo' AND pax<>0 THEN RAISE EXCEPTION 'Chargement cargo invalide'; END IF;
      IF coalesce((p_candidate->>'cargo_bonus_percent')::numeric,0) NOT IN (0,30) THEN RAISE EXCEPTION 'Bonus invalide'; END IF;
    ELSIF pax<>0 OR cargo<>0 THEN RAISE EXCEPTION 'Chargement commercial interdit'; END IF;
    pricing:=flight_submission_pricing(p_scope,p_candidate);
    IF coalesce((p_scope->>'vol_commercial')::boolean,false) AND
      ((pricing->>'prix_billet_utilise')::numeric IS DISTINCT FROM (p_candidate->>'prix_billet_reference')::numeric OR
       (pricing->>'prix_kg_cargo_utilise')::numeric IS DISTINCT FROM (p_candidate->>'prix_kg_reference')::numeric) THEN
      RAISE EXCEPTION 'Le tarif a changé pendant le calcul. Actualisez le chargement';
    END IF;
    INSERT INTO flight_submission_quotes(actor_id,utc_day,scope,draw,pricing) VALUES(p_actor,day,p_scope,p_candidate,pricing) RETURNING * INTO q;
  END IF;
  IF q.pricing='{}'::jsonb THEN
    UPDATE flight_submission_quotes SET pricing=flight_submission_pricing(q.scope,q.draw) WHERE id=q.id RETURNING * INTO q;
  END IF;
  RETURN q.pricing||jsonb_build_object('quote_id',q.id,'expires_at',(day+1)::timestamp AT TIME ZONE 'UTC');
END $$;

CREATE OR REPLACE FUNCTION public.submit_flight_plan_integrity(p_actor uuid,p_plan jsonb,p_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q flight_submission_quotes%ROWTYPE; a compagnie_avions%ROWTYPE; cap types_avion%ROWTYPE;
  lease compagnie_locations%ROWTYPE; account felitz_comptes%ROWTYPE; lessor_account felitz_comptes%ROWTYPE; source aeroports%ROWTYPE;
  c uuid := (p_plan->>'compagnie_id')::uuid; a_id uuid := (p_plan->>'compagnie_avion_id')::uuid;
  personal uuid := (p_plan->>'inventaire_avion_id')::uuid; co uuid := (p_plan->>'copilote_id')::uuid;
  live_scope jsonb; pricing jsonb; payload jsonb; columns text; new_id uuid; pax integer; cargo integer;
  rent numeric := 0; days_due integer := 0; last_billed timestamptz; free_rent boolean := false;
  ferry_base numeric := 0; ferry_tax numeric := 0; tax_rate numeric; total numeric; ad text:=p_plan->>'aeroport_depart';
  occupied text[] := ARRAY['depose','en_attente','en_attente_copilote','accepte','en_cours','automonitoring','en_attente_cloture','en_pause','planifie_suivant'];
BEGIN
  -- Actor lock serializes simultaneous submissions across different aircraft/routes.
  PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||p_actor::text,0));
  SELECT * INTO q FROM flight_submission_quotes WHERE id=p_quote AND actor_id=p_actor FOR UPDATE;
  IF NOT FOUND OR q.utc_day<>(now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Le devis du vol a expiré'; END IF;
  live_scope:=jsonb_build_object('aeroport_depart',ad,'aeroport_arrivee',p_plan->>'aeroport_arrivee','compagnie_id',c,'compagnie_avion_id',a_id,'inventaire_avion_id',personal,
    'vol_commercial',coalesce((p_plan->>'vol_commercial')::boolean,false),'vol_ferry',coalesce((p_plan->>'vol_ferry')::boolean,false),'nature_transport',p_plan->'nature_transport');
  IF live_scope<>q.scope OR (p_plan->>'pilote_id')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Le devis ne correspond pas au vol'; END IF;
  PERFORM authorize_flight_submission(p_actor,live_scope);
  IF p_plan->>'statut' NOT IN ('accepte','en_attente','en_attente_copilote') THEN RAISE EXCEPTION 'Statut de dépôt invalide'; END IF;
  IF EXISTS(SELECT 1 FROM plans_vol WHERE (pilote_id=p_actor OR copilote_id=p_actor) AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Vous avez déjà un plan de vol actif'; END IF;
  IF co IS NOT NULL THEN
    IF co=p_actor OR c IS NULL THEN RAISE EXCEPTION 'Copilote invalide'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||co::text,0));
    IF NOT EXISTS(SELECT 1 FROM compagnies WHERE id=c AND pdg_id=co) AND NOT EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=c AND pilote_id=co) THEN RAISE EXCEPTION 'Le copilote doit appartenir à la compagnie'; END IF;
    IF EXISTS(SELECT 1 FROM plans_vol WHERE (pilote_id=co OR copilote_id=co) AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Le copilote a déjà un plan actif'; END IF;
  END IF;
  IF a_id IS NOT NULL THEN
    SELECT * INTO a FROM compagnie_avions WHERE id=a_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Appareil introuvable'; END IF;
    IF a.aeroport_actuel IS DISTINCT FROM ad OR a.statut NOT IN ('ground','disponible') OR coalesce(a.detruit,false) OR coalesce(a.bloque_incident,false) THEN RAISE EXCEPTION 'Appareil indisponible à cet aéroport'; END IF;
    IF NOT coalesce((live_scope->>'vol_ferry')::boolean,false) AND coalesce((to_jsonb(a)->>'usure_percent')::numeric,100)<=0 THEN RAISE EXCEPTION 'Appareil à réparer avant un vol commercial'; END IF;
    IF EXISTS(SELECT 1 FROM plans_vol WHERE compagnie_avion_id=a_id AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Cet appareil a déjà un plan actif'; END IF;
    IF EXISTS(SELECT 1 FROM reparation_demandes WHERE avion_id=a_id AND statut IN ('acceptee','en_transit','en_reparation','mini_jeux','terminee','facturee','payee','retour_transit'))
      OR EXISTS(SELECT 1 FROM vols_ferry WHERE avion_id=a_id AND statut IN ('planned','in_progress')) THEN RAISE EXCEPTION 'Appareil engagé en réparation ou transfert'; END IF;
    SELECT * INTO lease FROM compagnie_locations WHERE avion_id=a_id AND statut='active' AND start_at<=now() AND end_at>=now() ORDER BY id LIMIT 1 FOR UPDATE;
    IF a.compagnie_id IS DISTINCT FROM c THEN
      IF lease.id IS NULL OR lease.locataire_compagnie_id IS DISTINCT FROM c THEN RAISE EXCEPTION 'Location de cet appareil invalide'; END IF;
    ELSIF lease.id IS NOT NULL AND lease.locataire_compagnie_id IS DISTINCT FROM c THEN RAISE EXCEPTION 'Cet appareil est loué à une autre compagnie'; END IF;
    SELECT * INTO cap FROM types_avion WHERE id=a.type_avion_id FOR SHARE;
  ELSIF personal IS NOT NULL THEN
    PERFORM 1 FROM inventaire_avions WHERE id=personal FOR UPDATE;
    IF EXISTS(SELECT 1 FROM plans_vol WHERE inventaire_avion_id=personal AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Cet appareil personnel a déjà un plan actif'; END IF;
  END IF;
  pax:=coalesce((q.draw->>'nb_pax_genere')::integer,0); cargo:=coalesce((q.draw->>'cargo_kg_genere')::integer,0);
  IF (live_scope->>'vol_commercial')::boolean THEN
    IF pax>coalesce(cap.capacite_pax,0) OR cargo>coalesce(cap.capacite_cargo_kg,0) THEN RAISE EXCEPTION 'Capacité de l’appareil modifiée'; END IF;
    IF ad<>p_plan->>'aeroport_arrivee' THEN
      IF (live_scope->>'nature_transport'='passagers' AND (cap.capacite_pax<=0 OR pax<cap.capacite_pax*0.25))
        OR (live_scope->>'nature_transport'='cargo' AND (cap.capacite_cargo_kg<=0 OR cargo<cap.capacite_cargo_kg*0.25)) THEN RAISE EXCEPTION 'Remplissage insuffisant : minimum 25 %% requis hors vol local'; END IF;
    END IF;
    SELECT * INTO source FROM aeroports WHERE code_oaci=ad FOR UPDATE;
    IF NOT FOUND OR coalesce(source.passagers_disponibles,0)<pax OR coalesce(source.cargo_disponible,0)<cargo THEN RAISE EXCEPTION 'Stock insuffisant pour le chargement réservé. Réessayez après sa régénération'; END IF;
  END IF;
  -- Prices and revenue stay coupled to the first daily load draw. Raising prices after
  -- a free/cheap quote cannot keep its advantageous quantity and obtain higher revenue.
  pricing:=q.pricing;
  IF pricing='{}'::jsonb THEN RAISE EXCEPTION 'Devis incomplet. Actualisez le chargement'; END IF;
  IF (live_scope->>'vol_ferry')::boolean THEN
    ferry_base:=10000;
    SELECT taxe_pourcent INTO tax_rate FROM taxes_aeroport WHERE code_oaci=p_plan->>'aeroport_arrivee' FOR SHARE;
    ferry_tax:=round(ferry_base*greatest(0,coalesce(tax_rate,2))/100);
  END IF;
  IF lease.id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM compagnies t JOIN compagnies l ON l.id=lease.loueur_compagnie_id JOIN alliance_parametres ap ON ap.alliance_id=t.alliance_id
      WHERE t.id=c AND t.alliance_id=l.alliance_id AND ap.pret_avions_actif) INTO free_rent;
    last_billed:=coalesce(lease.last_billed_at,lease.start_at,now()); days_due:=greatest(0,floor(extract(epoch FROM (now()-last_billed))/86400));
    IF NOT free_rent THEN rent:=days_due*greatest(0,coalesce(lease.prix_journalier,0)); END IF;
  END IF;
  total:=ferry_base+ferry_tax+rent;
  IF total>0 THEN
    SELECT * INTO account FROM felitz_comptes WHERE compagnie_id=c AND type='entreprise' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR account.solde<total THEN RAISE EXCEPTION 'Solde insuffisant pour les frais de ce vol'; END IF;
  END IF;
  IF rent>0 THEN
    SELECT * INTO lessor_account FROM felitz_comptes WHERE compagnie_id=lease.loueur_compagnie_id AND type='entreprise' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compte entreprise du bailleur introuvable'; END IF;
  END IF;
  -- All validations precede any financial or stock mutation; the entire function is one transaction.
  payload:=p_plan||pricing||jsonb_build_object('flight_submission_quote_id',q.id,
    'location_id',lease.id,'location_loueur_compagnie_id',lease.loueur_compagnie_id,'location_pourcentage_revenu_loueur',lease.pourcentage_revenu_loueur,'location_prix_journalier',lease.prix_journalier);
  IF NOT (live_scope->>'vol_commercial')::boolean THEN
    payload:=payload||jsonb_build_object('nb_pax_genere',null,'cargo_kg_genere',null,'revenue_brut',null,'salaire_pilote',null,'prix_billet_utilise',null,'type_cargaison',null,'type_cargaison_libelle',null);
  END IF;
  -- Only columns explicitly supplied by the server are inserted, preserving database defaults.
  SELECT string_agg(format('%I',key),',' ORDER BY key) INTO columns FROM jsonb_object_keys(payload) key
    WHERE key NOT IN ('id','created_at','updated_at','prix_kg_cargo_utilise') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans_vol' AND column_name=key);
  EXECUTE format('INSERT INTO public.plans_vol(%s) SELECT %s FROM jsonb_populate_record(NULL::public.plans_vol,$1) RETURNING id',columns,columns) INTO new_id USING payload;
  IF (live_scope->>'vol_commercial')::boolean THEN
    UPDATE aeroports SET passagers_disponibles=passagers_disponibles-pax,cargo_disponible=cargo_disponible-cargo,updated_at=now() WHERE code_oaci=ad;
  END IF;
  IF total>0 THEN
    UPDATE felitz_comptes SET solde=solde-total WHERE id=account.id;
    IF ferry_base>0 THEN INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'debit',ferry_base,'Vol ferry '||ad||' → '||(p_plan->>'aeroport_arrivee')); END IF;
    IF ferry_tax>0 THEN INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'debit',ferry_tax,'Taxes aéroportuaires '||(p_plan->>'aeroport_arrivee')||' (vol ferry)'); END IF;
    IF rent>0 THEN
      INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'debit',rent,'Loyer avion ('||days_due||'j)');
      UPDATE felitz_comptes SET solde=solde+rent WHERE id=lessor_account.id;
      INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(lessor_account.id,'credit',rent,'Location avion ('||days_due||'j)');
    END IF;
  END IF;
  IF lease.id IS NOT NULL AND days_due>0 THEN UPDATE compagnie_locations SET last_billed_at=last_billed+days_due*interval '1 day' WHERE id=lease.id; END IF;
  IF a_id IS NOT NULL AND p_plan->>'statut'='accepte' THEN UPDATE compagnie_avions SET statut='in_flight' WHERE id=a_id; END IF;
  RETURN jsonb_build_object('id',new_id,'quote_id',q.id);
END $$;

-- New plans restore stock once, under the same transaction as cancellation/refusal.
CREATE OR REPLACE FUNCTION public.release_flight_submission_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q flight_submission_quotes%ROWTYPE; a compagnie_avions%ROWTYPE; source aeroports%ROWTYPE;
  occupied text[] := ARRAY['depose','en_attente','en_attente_copilote','accepte','en_cours','automonitoring','en_attente_cloture','en_pause','planifie_suivant'];
BEGIN
  IF NEW.flight_submission_quote_id IS NOT NULL AND OLD.flight_stock_released_at IS NOT NULL AND NEW.statut=ANY(occupied) AND NOT OLD.statut=ANY(occupied) THEN
    SELECT * INTO q FROM flight_submission_quotes WHERE id=NEW.flight_submission_quote_id FOR SHARE;
    IF NOT FOUND OR q.utc_day<>(now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Le devis a expiré. Déposez un nouveau plan'; END IF;
    IF NEW.aeroport_depart IS DISTINCT FROM q.scope->>'aeroport_depart' OR NEW.aeroport_arrivee IS DISTINCT FROM q.scope->>'aeroport_arrivee' THEN
      RAISE EXCEPTION 'Pour changer le trajet après refus, déposez un nouveau plan afin de recalculer le chargement';
    END IF;
    PERFORM authorize_flight_submission(NEW.pilote_id,q.scope);
    PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||NEW.pilote_id::text,0));
    IF EXISTS(SELECT 1 FROM plans_vol WHERE id<>NEW.id AND (pilote_id=NEW.pilote_id OR copilote_id=NEW.pilote_id OR (NEW.compagnie_avion_id IS NOT NULL AND compagnie_avion_id=NEW.compagnie_avion_id)) AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Pilote ou appareil déjà engagé sur un autre vol'; END IF;
    IF NEW.compagnie_avion_id IS NOT NULL THEN
      SELECT * INTO a FROM compagnie_avions WHERE id=NEW.compagnie_avion_id FOR UPDATE;
      IF NOT FOUND OR a.aeroport_actuel IS DISTINCT FROM NEW.aeroport_depart OR a.statut NOT IN ('ground','disponible') OR coalesce(a.detruit,false) OR coalesce(a.bloque_incident,false) THEN RAISE EXCEPTION 'Appareil indisponible'; END IF;
      IF NOT coalesce(NEW.vol_ferry,false) AND coalesce((to_jsonb(a)->>'usure_percent')::numeric,100)<=0 THEN RAISE EXCEPTION 'Appareil à réparer avant un vol commercial'; END IF;
      IF EXISTS(SELECT 1 FROM reparation_demandes WHERE avion_id=a.id AND statut IN ('acceptee','en_transit','en_reparation','mini_jeux','terminee','facturee','payee','retour_transit'))
        OR EXISTS(SELECT 1 FROM vols_ferry WHERE avion_id=a.id AND statut IN ('planned','in_progress')) THEN RAISE EXCEPTION 'Appareil engagé en réparation ou transfert'; END IF;
    END IF;
    IF NEW.vol_commercial THEN
      SELECT * INTO source FROM aeroports WHERE code_oaci=NEW.aeroport_depart FOR UPDATE;
      IF NOT FOUND OR coalesce(source.passagers_disponibles,0)<coalesce(NEW.nb_pax_genere,0) OR coalesce(source.cargo_disponible,0)<coalesce(NEW.cargo_kg_genere,0) THEN RAISE EXCEPTION 'Stock insuffisant pour reprendre ce plan'; END IF;
      UPDATE aeroports SET passagers_disponibles=passagers_disponibles-coalesce(NEW.nb_pax_genere,0),cargo_disponible=cargo_disponible-coalesce(NEW.cargo_kg_genere,0),updated_at=now() WHERE code_oaci=NEW.aeroport_depart;
    END IF;
    IF NEW.compagnie_avion_id IS NOT NULL AND NEW.statut='accepte' THEN UPDATE compagnie_avions SET statut='in_flight' WHERE id=NEW.compagnie_avion_id; END IF;
    NEW.flight_stock_released_at:=NULL;
  END IF;
  IF NEW.flight_submission_quote_id IS NOT NULL AND NEW.flight_stock_released_at IS NULL AND
      NEW.statut IN ('annule','refuse') AND OLD.statut NOT IN ('annule','refuse','cloture') THEN
    IF OLD.vol_commercial THEN UPDATE aeroports SET
      passagers_disponibles=least(passagers_max,passagers_disponibles+coalesce(OLD.nb_pax_genere,0)),
      cargo_disponible=least(cargo_max,cargo_disponible+coalesce(OLD.cargo_kg_genere,0)),updated_at=now()
      WHERE code_oaci=OLD.aeroport_depart; END IF;
    NEW.flight_stock_released_at:=now();
    IF OLD.compagnie_avion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM plans_vol WHERE id<>OLD.id AND compagnie_avion_id=OLD.compagnie_avion_id AND statut=ANY(occupied)) THEN
      UPDATE compagnie_avions SET statut='ground',aeroport_actuel=OLD.aeroport_depart WHERE id=OLD.compagnie_avion_id AND statut='in_flight';
    END IF;
  END IF;
  IF NEW.flight_submission_quote_id IS NOT NULL AND NEW.statut='accepte' AND OLD.statut='en_attente_copilote' AND NEW.compagnie_avion_id IS NOT NULL THEN
    UPDATE compagnie_avions SET statut='in_flight' WHERE id=NEW.compagnie_avion_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS release_flight_submission_stock ON public.plans_vol;
CREATE TRIGGER release_flight_submission_stock BEFORE UPDATE OF statut ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.release_flight_submission_stock();
REVOKE ALL ON FUNCTION public.authorize_flight_submission(uuid,jsonb), public.flight_submission_pricing(jsonb,jsonb), public.get_flight_submission_quote(uuid,jsonb,jsonb), public.submit_flight_plan_integrity(uuid,jsonb,uuid), public.release_flight_submission_stock() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_flight_submission(uuid,jsonb), public.flight_submission_pricing(jsonb,jsonb), public.get_flight_submission_quote(uuid,jsonb,jsonb), public.submit_flight_plan_integrity(uuid,jsonb,uuid) TO service_role;



-- Source: supabase/flight_plan_access_20261029.sql
-- SHA-256: 7348d2ea5483176a3e168bddbf75f05e8e4479d2e37505f2f5c0d7b51fdac520
-- Apply after logbook_staff_validation and flight_submission_integrity.
-- Flight writes use the checked server APIs, including legacy/manual/military plans.
-- SELECT policies and realtime subscriptions are unchanged.
CREATE OR REPLACE FUNCTION public.guard_flight_plan_server_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.logbook_is_privileged_writer() THEN
    RAISE EXCEPTION 'Utilisez les commandes du site pour déposer ou modifier un plan de vol.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_flight_plan_server_writes ON public.plans_vol;
CREATE TRIGGER guard_flight_plan_server_writes BEFORE INSERT OR UPDATE OR DELETE ON public.plans_vol
FOR EACH ROW EXECUTE FUNCTION public.guard_flight_plan_server_writes();
REVOKE ALL ON FUNCTION public.guard_flight_plan_server_writes() FROM PUBLIC,anon,authenticated;

-- Older stock functions must not offer a second public consumption path.
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('consommer_passagers_aeroport','consommer_cargo')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';



-- Source: supabase/fix_revente_avions_personnels.sql
-- SHA-256: a468d20f56c06c2acb0b9ac7ab2a99fe54aba81248e3983361952c56927c2588
-- Correction du refus des avions personnels dont instruction_lifecycle vaut brouillon par défaut.
-- Réinstalle uniquement la fonction de revente, sans modifier les avions ni les soldes.
CREATE OR REPLACE FUNCTION public.revendre_avion_atomic(p_actor UUID,p_inventaire UUID DEFAULT NULL,p_flotte UUID DEFAULT NULL,p_demande UUID DEFAULT NULL,p_commentaire TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seller UUID:=p_actor; inv UUID:=p_inventaire; fleet UUID:=p_flotte; request_row hangar_market_reventes%ROWTYPE; aircraft RECORD; aircraft_type RECORD; company_id UUID; account_id UUID; amount BIGINT; initial_price BIGINT; rate INTEGER:=50; weekly_count INTEGER:=0; sale_id UUID;
BEGIN
  IF p_demande IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE='42501'; END IF;
    SELECT * INTO request_row FROM hangar_market_reventes WHERE id=p_demande FOR UPDATE;
    IF NOT FOUND OR request_row.statut<>'en_attente' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
    seller:=request_row.demandeur_id; inv:=request_row.inventaire_avion_id; fleet:=request_row.compagnie_avion_id; rate:=request_row.pourcentage_demande;
  END IF;
  IF seller IS NULL OR (inv IS NULL)=(fleet IS NULL) OR rate NOT BETWEEN 50 AND 100 THEN RAISE EXCEPTION 'Sélectionnez un seul avion disponible'; END IF;
  -- Sérialiser la limite hebdomadaire, même pour deux appareils distincts.
  PERFORM pg_advisory_xact_lock(hashtextextended('resale:'||seller::text,0));
  IF p_demande IS NULL THEN
    SELECT count(*) INTO weekly_count FROM hangar_market_reventes WHERE demandeur_id=seller AND statut='executee' AND admin_id IS NULL AND created_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF weekly_count>=2 THEN RAISE EXCEPTION 'Limite de 2 reventes rapides par semaine atteinte'; END IF;
  END IF;
  IF inv IS NOT NULL THEN
    SELECT id,type_avion_id,prix_achat,proprietaire_id,instruction_actif,instruction_session_id,instruction_lifecycle INTO aircraft FROM inventaire_avions WHERE id=inv FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Avion introuvable ou déjà revendu'; END IF;
    -- Le lifecycle vaut aussi 'brouillon' par défaut pour les avions personnels.
    -- Seuls le marquage instruction et le rattachement à une session les distinguent.
    IF aircraft.instruction_actif IS TRUE OR aircraft.instruction_session_id IS NOT NULL THEN RAISE EXCEPTION 'Les avions fictifs d’instruction ne peuvent pas être revendus'; END IF;
    IF aircraft.proprietaire_id IS DISTINCT FROM seller THEN RAISE EXCEPTION 'Cet avion ne vous appartient pas' USING ERRCODE='42501'; END IF;
    SELECT id INTO account_id FROM felitz_comptes WHERE proprietaire_id=seller AND type='personnel';
  ELSE
    SELECT id,type_avion_id,prix_achat,compagnie_id,statut,detruit INTO aircraft FROM compagnie_avions WHERE id=fleet FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Avion introuvable ou déjà revendu'; END IF;
    company_id:=aircraft.compagnie_id;
    IF NOT EXISTS(SELECT 1 FROM compagnies WHERE id=company_id AND pdg_id=seller) THEN RAISE EXCEPTION 'Seul le PDG peut vendre un avion de la flotte' USING ERRCODE='42501'; END IF;
    IF aircraft.detruit OR aircraft.statut='in_flight' THEN RAISE EXCEPTION 'Cet avion est détruit ou en vol'; END IF;
    SELECT id INTO account_id FROM felitz_comptes WHERE compagnie_id=company_id AND type='entreprise';
  END IF;
  IF EXISTS(SELECT 1 FROM hangar_market WHERE statut='en_vente' AND ((inv IS NOT NULL AND inventaire_avion_id=inv) OR (fleet IS NOT NULL AND compagnie_avion_id=fleet))) THEN RAISE EXCEPTION 'Retirez l’annonce de vente avant de revendre cet avion'; END IF;
  IF EXISTS(SELECT 1 FROM plans_vol WHERE statut IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture') AND ((inv IS NOT NULL AND inventaire_avion_id=inv) OR (fleet IS NOT NULL AND compagnie_avion_id=fleet))) THEN RAISE EXCEPTION 'Impossible de revendre un avion utilisé par un plan actif'; END IF;
  SELECT id,nom,prix INTO aircraft_type FROM types_avion WHERE id=aircraft.type_avion_id;
  IF NOT FOUND OR aircraft_type.prix IS NULL OR aircraft_type.prix<=0 THEN RAISE EXCEPTION 'Prix catalogue introuvable'; END IF;
  initial_price:=least(aircraft_type.prix,CASE WHEN aircraft.prix_achat>0 THEN aircraft.prix_achat ELSE aircraft_type.prix END);
  amount:=round(initial_price::numeric*rate/100);
  UPDATE felitz_comptes SET solde=solde+amount WHERE id=account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte Felitz introuvable'; END IF;
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account_id,'credit',amount,'Revente avion '||aircraft_type.nom||' ('||rate||'% du prix initial)');
  IF p_demande IS NULL THEN
    INSERT INTO hangar_market_reventes(demandeur_id,inventaire_avion_id,compagnie_avion_id,compagnie_id,type_avion_id,prix_initial,pourcentage_demande,montant_revente,statut,execute_at)
      VALUES(seller,inv,fleet,company_id,aircraft_type.id,initial_price,rate,amount,'executee',now()) RETURNING id INTO sale_id;
  ELSE
    UPDATE hangar_market_reventes SET statut='executee',admin_id=p_actor,admin_commentaire=p_commentaire,traite_at=now(),execute_at=now(),montant_revente=amount WHERE id=p_demande;
    sale_id:=p_demande;
  END IF;
  IF inv IS NOT NULL THEN DELETE FROM inventaire_avions WHERE id=inv; ELSE DELETE FROM compagnie_avions WHERE id=fleet; END IF;
  RETURN jsonb_build_object('ok',true,'id',sale_id,'montant',amount,'restantes',greatest(0,1-weekly_count),'type_nom',aircraft_type.nom,'demandeur_id',seller,'pourcentage',rate);
END $$;
REVOKE ALL ON FUNCTION public.revendre_avion_atomic(UUID,UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revendre_avion_atomic(UUID,UUID,UUID,UUID,TEXT) TO service_role;


COMMIT;
