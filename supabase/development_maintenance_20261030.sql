-- Conditions figées au début du cycle ; aucune refacturation des anciennes réparations.
ALTER TABLE public.reparation_demandes ADD COLUMN IF NOT EXISTS development_effects jsonb;
ALTER TABLE public.reparation_demandes ADD COLUMN IF NOT EXISTS maintenance_not_before timestamptz;
ALTER TABLE public.compagnie_avions ADD COLUMN IF NOT EXISTS development_maintenance_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_development_repair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE effects jsonb; needs_inspection boolean; min_minutes numeric;
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.development_effects:=NULL; NEW.maintenance_not_before:=NULL;
  ELSIF NOT public.logbook_is_privileged_writer() AND (
    NEW.development_effects IS DISTINCT FROM OLD.development_effects OR
    NEW.maintenance_not_before IS DISTINCT FROM OLD.maintenance_not_before
  ) THEN RAISE EXCEPTION 'Conditions de maintenance contrôlées par le serveur.' USING ERRCODE='42501';
  END IF;
  IF NEW.statut IN ('en_reparation','mini_jeux') AND NEW.development_effects IS NULL
    AND (TG_OP='INSERT' OR OLD.statut NOT IN ('en_reparation','mini_jeux')) THEN
    effects:=public.company_development_effects(NEW.compagnie_id,NEW.avion_id,now());
    NEW.development_effects:=effects;
    NEW.debut_reparation_at:=now();
    needs_inspection:=coalesce((effects->>'inspection_required')::boolean,false);
    min_minutes:=CASE WHEN needs_inspection OR coalesce((effects->>'repair_delay_percent')::numeric,0)>0
      THEN 30 * greatest(0.2,least(4,1+coalesce((effects->>'repair_delay_percent')::numeric,0)/100)) ELSE 0 END;
    NEW.maintenance_not_before:=now()+make_interval(secs=>(min_minutes*60)::double precision);
  END IF;
  IF TG_OP='UPDATE' AND NEW.statut='terminee' AND OLD.statut IN ('en_reparation','mini_jeux') THEN
    IF NEW.maintenance_not_before>now() THEN
      RAISE EXCEPTION 'Le délai technique de maintenance n’est pas terminé.' USING ERRCODE='23514';
    END IF;
    IF NEW.development_effects IS NOT NULL THEN
      NEW.prix_total:=greatest(0,round(coalesce(NEW.prix_total,0) *
        greatest(0.2,least(4,1+coalesce((NEW.development_effects->>'repair_percent')::numeric,0)/100))))::integer;
    END IF;
    NEW.fin_reparation_at:=now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS development_repair_before ON public.reparation_demandes;
CREATE TRIGGER development_repair_before BEFORE INSERT OR UPDATE ON public.reparation_demandes
  FOR EACH ROW EXECUTE FUNCTION public.guard_development_repair();

CREATE OR REPLACE FUNCTION public.finish_development_repair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.statut='terminee' AND OLD.statut IN ('en_reparation','mini_jeux') AND NEW.debut_reparation_at IS NOT NULL AND NEW.fin_reparation_at IS NOT NULL THEN
    PERFORM public.company_development_complete_inspection(NEW.avion_id,NEW.id,NEW.debut_reparation_at,NEW.fin_reparation_at);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS development_repair_after ON public.reparation_demandes;
CREATE TRIGGER development_repair_after AFTER UPDATE ON public.reparation_demandes
  FOR EACH ROW EXECUTE FUNCTION public.finish_development_repair();

CREATE OR REPLACE FUNCTION public.track_development_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE effects jsonb;
BEGIN
  IF NOT public.logbook_is_privileged_writer() AND (
    NEW.development_maintenance_started_at IS DISTINCT FROM OLD.development_maintenance_started_at OR
    (NEW.statut IS DISTINCT FROM OLD.statut AND (NEW.statut='maintenance' OR OLD.statut='maintenance'))
  ) THEN RAISE EXCEPTION 'Le cycle technique est contrôlé par le serveur.' USING ERRCODE='42501'; END IF;
  IF NEW.statut='maintenance' AND OLD.statut<>'maintenance' THEN
    NEW.development_maintenance_started_at:=now();
  ELSIF OLD.statut='maintenance' AND NEW.statut IN ('ground','disponible') AND NEW.usure_percent=100 THEN
    IF OLD.maintenance_fin_at IS NULL OR OLD.maintenance_fin_at>now() OR OLD.development_maintenance_started_at IS NULL THEN
      -- Une ancienne maintenance sans horodatage reste utilisable, sans certifier une nouvelle inspection.
      RETURN NEW;
    END IF;
    PERFORM public.company_development_complete_inspection(NEW.id,NULL,OLD.development_maintenance_started_at,now());
    NEW.development_maintenance_started_at:=NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS development_aircraft_maintenance ON public.compagnie_avions;
CREATE TRIGGER development_aircraft_maintenance BEFORE UPDATE ON public.compagnie_avions
  FOR EACH ROW EXECUTE FUNCTION public.track_development_maintenance();
REVOKE ALL ON FUNCTION public.guard_development_repair(), public.finish_development_repair(),public.track_development_maintenance() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.start_company_maintenance(p_actor uuid,p_aircraft uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record; company uuid; account record; effects jsonb; price integer; minutes integer; ending timestamptz;
BEGIN
  SELECT * INTO a FROM public.compagnie_avions WHERE id=p_aircraft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avion introuvable.' USING ERRCODE='22023'; END IF;
  SELECT locataire_compagnie_id INTO company FROM public.compagnie_locations
    WHERE avion_id=a.id AND statut='active' AND start_at<=now() AND end_at>=now() ORDER BY start_at DESC LIMIT 1;
  company:=coalesce(company,a.compagnie_id);
  IF NOT public.company_development_is_leader(p_actor,company) THEN RAISE EXCEPTION 'Seul un dirigeant peut lancer cette maintenance.' USING ERRCODE='42501'; END IF;
  IF a.statut='maintenance' AND a.maintenance_fin_at IS NOT NULL THEN
    IF a.maintenance_fin_at>now() THEN
      RETURN jsonb_build_object('ok',true,'maintenance_fin_at',a.maintenance_fin_at,'temps_attente_min',ceil(extract(epoch FROM(a.maintenance_fin_at-now()))/60),'message','La maintenance est déjà en cours.');
    END IF;
    UPDATE public.compagnie_avions SET usure_percent=100,statut='ground',maintenance_fin_at=NULL WHERE id=a.id;
    RETURN jsonb_build_object('ok',true,'repare',true,'message','Maintenance terminée et appareil libéré.');
  END IF;
  effects:=public.company_development_effects(company,a.id,now());
  IF a.detruit OR a.bloque_incident OR a.statut IN ('in_flight','en_reparation','en_transit') OR
    EXISTS(SELECT 1 FROM public.plans_vol WHERE compagnie_avion_id=a.id AND statut::text NOT IN ('cloture','refuse','annule')) OR
    EXISTS(SELECT 1 FROM public.reparation_demandes WHERE avion_id=a.id AND statut NOT IN ('completee','refusee','annulee')) THEN
    RAISE EXCEPTION 'Cet appareil est déjà engagé ou bloqué par un incident.' USING ERRCODE='22023';
  END IF;
  IF a.statut<>'bloque' AND a.usure_percent<>0 AND NOT coalesce((effects->>'inspection_required')::boolean,false) THEN
    RAISE EXCEPTION 'Cette maintenance sur place est réservée aux avions bloqués ou soumis à inspection.' USING ERRCODE='22023';
  END IF;
  price:=greatest(0,round(50000 * greatest(0.2,least(4,1+coalesce((effects->>'repair_percent')::numeric,0)/100))))::integer;
  minutes:=greatest(1,round((30+floor(random()*61))*greatest(0.2,least(4,1+coalesce((effects->>'repair_delay_percent')::numeric,0)/100))))::integer;
  SELECT * INTO account FROM public.felitz_comptes WHERE compagnie_id=company AND type='entreprise' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR account.solde<price THEN RAISE EXCEPTION 'Fonds insuffisants pour cette maintenance.' USING ERRCODE='22023'; END IF;
  UPDATE public.felitz_comptes SET solde=solde-price WHERE id=account.id;
  IF price>0 THEN INSERT INTO public.felitz_transactions(compte_id,type,montant,libelle,reference_id)
    VALUES(account.id,'debit',price,'Maintenance technique sur place — '||a.immatriculation,a.id); END IF;
  ending:=now()+make_interval(mins=>minutes);
  UPDATE public.compagnie_avions SET statut='maintenance',maintenance_fin_at=ending WHERE id=a.id;
  RETURN jsonb_build_object('ok',true,'cout',price,'maintenance_fin_at',ending,'temps_attente_min',minutes,'message',format('Maintenance engagée. Fin prévue dans %s minutes.',minutes));
END;
$$;
REVOKE ALL ON FUNCTION public.start_company_maintenance(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_company_maintenance(uuid,uuid) TO service_role;
