-- Validation du carnet et racine de confiance des profils.
-- Aucun changement des vols/profils historiques. Appliquer avant l'activation.
BEGIN;

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
COMMIT;
