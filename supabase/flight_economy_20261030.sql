-- Install after development/reviews and the 29 October submission safeguards.
-- No activation here. Existing plans and existing daily quotes remain legacy.
BEGIN;
ALTER TABLE public.compagnies ALTER COLUMN prix_billet_pax TYPE numeric(14,2);
ALTER TABLE public.compagnies ALTER COLUMN prix_kg_cargo TYPE numeric(14,2);
ALTER TABLE public.tarifs_liaisons ALTER COLUMN prix_billet TYPE numeric(14,2);
ALTER TABLE public.flight_submission_quotes ADD COLUMN IF NOT EXISTS economy_snapshot jsonb;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS economy_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS economy_snapshot jsonb;
CREATE TABLE IF NOT EXISTS public.flight_economy_tariff_reference (
  company_id uuid PRIMARY KEY REFERENCES public.compagnies(id), ticket numeric NOT NULL,
  kg numeric NOT NULL, route_prices jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.flight_economy_tariff_reference(company_id,ticket,kg,route_prices)
SELECT c.id,greatest(0,coalesce(c.prix_billet_pax,0)),greatest(0,coalesce(c.prix_kg_cargo,0)),
  coalesce((SELECT jsonb_object_agg(t.aeroport_depart||':'||t.aeroport_arrivee,t.prix_billet)
    FROM public.tarifs_liaisons t WHERE t.compagnie_id=c.id),'{}') FROM public.compagnies c
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.flight_economy_settlements (
  plan_id uuid PRIMARY KEY REFERENCES public.plans_vol(id), detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flight_economy_admin_closures (
  plan_id uuid PRIMARY KEY REFERENCES public.plans_vol(id), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flight_economy_tariff_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_economy_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_economy_admin_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flight_economy_tariff_reference,public.flight_economy_settlements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.flight_economy_admin_closures FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.flight_economy_tariff_reference,public.flight_economy_settlements TO service_role;
GRANT ALL ON public.flight_economy_admin_closures TO service_role;

-- Tariffs have cents; settled amounts remain whole F$. Explicit integer JSON
-- values also preserve jsonb_populate_record compatibility with legacy columns.
CREATE OR REPLACE FUNCTION public.flight_submission_pricing(p_scope jsonb,p_draw jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c compagnies%ROWTYPE; ticket numeric:=0; kg numeric:=0; revenue bigint:=0; salary bigint:=0;
 special numeric; pax integer:=coalesce((p_draw->>'nb_pax_genere')::integer,0); cargo integer:=coalesce((p_draw->>'cargo_kg_genere')::integer,0);
 bonus numeric:=coalesce((p_draw->>'cargo_bonus_percent')::numeric,0);
BEGIN
 IF coalesce((p_scope->>'vol_commercial')::boolean,false) THEN
   SELECT * INTO c FROM compagnies WHERE id=(p_scope->>'compagnie_id')::uuid FOR SHARE;
   ticket:=greatest(0,coalesce(c.prix_billet_pax,0));kg:=greatest(0,coalesce(c.prix_kg_cargo,0));
   SELECT prix_billet INTO special FROM tarifs_liaisons WHERE compagnie_id=c.id AND aeroport_depart=p_scope->>'aeroport_depart' AND aeroport_arrivee=p_scope->>'aeroport_arrivee' FOR SHARE;
   IF FOUND THEN ticket:=greatest(0,coalesce(special,0));END IF;
   revenue:=round(pax*ticket+round(cargo*kg*(1+bonus/100)))::bigint;
   salary:=floor(revenue*greatest(0,least(100,coalesce(c.pourcentage_salaire,0)))/100)::bigint;
   IF p_scope->>'nature_transport'='cargo' THEN ticket:=kg;END IF;
 END IF;
 RETURN jsonb_build_object('nb_pax_genere',pax,'cargo_kg_genere',cargo,'revenue_brut',revenue,'salaire_pilote',salary,
   'prix_billet_utilise',ticket,'prix_kg_cargo_utilise',kg,'type_cargaison',p_draw->'type_cargaison','type_cargaison_libelle',p_draw->'type_cargaison_libelle');
END $$;

-- Consumption is an RP model, not an aircraft performance document. Model names,
-- not passenger count alone, distinguish regional, single aisle and widebody jets.
CREATE OR REPLACE FUNCTION public.flight_economy_profile(p_type uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n text; liters numeric:=2300; taxi numeric:=220; speed numeric:=1; class text:='single_aisle';
BEGIN
 SELECT lower(coalesce(to_jsonb(t)->>'nom','')||' '||coalesce(to_jsonb(t)->>'constructeur','')) INTO n FROM types_avion t WHERE id=p_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Type appareil introuvable'; END IF;
 IF n ~ '(cessna.*172|c172|piper|cub|p2006|cirrus)' THEN liters:=25;taxi:=5;speed:=1.8;class:='piston';
 ELSIF n ~ '(caravan|208|twin otter|dhc.?6|pc.?12|king air)' THEN liters:=100;taxi:=15;speed:=1.4;class:='utility';
 ELSIF n ~ '(helicop|bell |robinson|r22|ec135|h135)' THEN liters:=180;taxi:=10;speed:=1.6;class:='helicopter';
 ELSIF n ~ '(atr|dash|q400|saab)' THEN liters:=700;taxi:=100;speed:=1.25;class:='turboprop';
 ELSIF n ~ '(e170|e175|e190|e195|embraer|crj|erj|a220|737.?200)' THEN liters:=1400;taxi:=130;class:='regional_jet';
 ELSIF n ~ '(concorde)' THEN liters:=20000;taxi:=1000;speed:=.8;class:='supersonic';
 ELSIF n ~ '(a380|airbus 380)' THEN liters:=12000;taxi:=800;class:='very_large';
 ELSIF n ~ '(747)' THEN liters:=11000;taxi:=700;class:='very_large';
 ELSIF n ~ '(a340|777|md.?11|dc.?10|l.?1011)' THEN liters:=7400;taxi:=600;class:='widebody';
 ELSIF n ~ '(a330|787|767|a350)' THEN liters:=5200;taxi:=450;class:='widebody';
 ELSIF n ~ '(757|a321)' THEN liters:=2900;taxi:=260;
 END IF;
 RETURN jsonb_build_object('class',class,'liters_hour',liters,'taxi_liters',taxi,'speed_factor',speed);
END $$;
CREATE OR REPLACE FUNCTION public.flight_economy_reference_minutes(p_depart text,p_arrival text,p_type uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE positions jsonb:='{"IBAR":[72.3,86.4],"IBLT":[42.5,64.8],"IBTH":[54.9,43.5],"IGAR":[39.2,71.7],"IKFL":[17.2,44.1],"ITEY":[12.5,37.5],"IHEN":[63.9,88.2],"IIAB":[68,87],"IJAF":[85.8,47.1],"ILAR":[66.9,79.7],"ILKL":[68.8,31.3],"IMLR":[36.7,61.6],"IPAP":[74.9,81.2],"IPPH":[64.4,27.4],"IRFD":[49.4,68.4],"ISAU":[15.2,74.5],"ISCM":[79,43.1],"ISKP":[70.8,60],"ITKO":[46.5,19.7],"ITRC":[50.1,79],"IUFO":[58,43.6],"IZOL":[85.2,51.5]}';
 a jsonb:=positions->p_depart; b jsonb:=positions->p_arrival; distance numeric; profile jsonb;
BEGIN
 profile:=flight_economy_profile(p_type);
 IF p_depart=p_arrival THEN RETURN 10; END IF;
 IF a IS NULL OR b IS NULL THEN RETURN 30; END IF;
 distance:=sqrt(power((a->>0)::numeric-(b->>0)::numeric,2)+power((a->>1)::numeric-(b->>1)::numeric,2));
 RETURN greatest(10,least(90,round((10+distance*.4)*(profile->>'speed_factor')::numeric)::integer));
END $$;

-- Keep the already deployed validators/stock reservation intact, then wrap them.
DO $$ BEGIN
 IF to_regprocedure('public.get_flight_submission_quote_legacy(uuid,jsonb,jsonb)') IS NULL THEN
   ALTER FUNCTION public.get_flight_submission_quote(uuid,jsonb,jsonb) RENAME TO get_flight_submission_quote_legacy;
 END IF;
 IF to_regprocedure('public.submit_flight_plan_integrity_legacy(uuid,jsonb,uuid)') IS NULL THEN
   ALTER FUNCTION public.submit_flight_plan_integrity(uuid,jsonb,uuid) RENAME TO submit_flight_plan_integrity_legacy;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_flight_submission_quote(p_actor uuid,p_scope jsonb,p_candidate jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; q flight_submission_quotes%ROWTYPE; existing boolean; enabled boolean;
 c compagnies%ROWTYPE; aircraft compagnie_avions%ROWTYPE; refs flight_economy_tariff_reference%ROWTYPE;
 lease compagnie_locations%ROWTYPE; source aeroports%ROWTYPE; alliance_terms jsonb:='{}'; alliance_partners jsonb:='[]'; ap alliance_parametres%ROWTYPE; alliance_share numeric:=0;
 profile jsonb; effects jsonb; snap jsonb; candidate jsonb:=p_candidate; minutes integer; liters numeric; base_fuel bigint; fuel bigint; reputation numeric:=0; ratio numeric:=1; cap types_avion%ROWTYPE;
 passenger numeric; cargo numeric; reference_revenue numeric; reference_ticket numeric; allowance bigint; modified bigint; reference_tax numeric:=0; reference_allowance bigint;
BEGIN
 -- The legacy advisory key serialises the whole upgrade, including simultaneous previews.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||(now() AT TIME ZONE 'UTC')::date::text||p_scope::text||':v1',0));
 SELECT EXISTS(SELECT 1 FROM flight_submission_quotes WHERE actor_id=p_actor AND utc_day=(now() AT TIME ZONE 'UTC')::date AND version=1 AND scope=p_scope) INTO existing;
 SELECT s.enabled INTO enabled FROM economy_release_settings s WHERE id;
 IF coalesce(enabled,false) AND NOT existing AND coalesce((p_scope->>'vol_commercial')::boolean,false) THEN
   SELECT * INTO aircraft FROM compagnie_avions WHERE id=(p_scope->>'compagnie_avion_id')::uuid FOR SHARE;
   SELECT * INTO cap FROM types_avion WHERE id=aircraft.type_avion_id FOR SHARE;
   effects:=company_development_effects_for_flight((p_scope->>'compagnie_id')::uuid,aircraft.id,now(),p_scope->>'aeroport_depart',p_scope->>'aeroport_arrivee',p_scope->>'nature_transport');
   reputation:=greatest(-8,least(3,coalesce(flight_review_reputation((p_scope->>'compagnie_id')::uuid,now()),0)));
   ratio:=greatest(.7,least(1,coalesce((effects->>'seat_ratio')::numeric,1)));
   SELECT * INTO source FROM aeroports WHERE code_oaci=p_scope->>'aeroport_depart' FOR SHARE;
   candidate:=candidate||jsonb_build_object('nb_pax_genere',least(source.passagers_disponibles,floor(cap.capacite_pax*ratio),floor(coalesce((candidate->>'nb_pax_genere')::numeric,0)*ratio*(1+reputation/100))),
     'cargo_kg_genere',least(source.cargo_disponible,cap.capacite_cargo_kg,floor(coalesce((candidate->>'cargo_kg_genere')::numeric,0)*(1+reputation/100))));
 END IF;
 result:=get_flight_submission_quote_legacy(p_actor,p_scope,candidate);
 SELECT * INTO q FROM flight_submission_quotes WHERE id=(result->>'quote_id')::uuid FOR UPDATE;
 IF q.economy_snapshot IS NOT NULL OR existing OR NOT coalesce(enabled,false) OR NOT coalesce((p_scope->>'vol_commercial')::boolean,false) THEN RETURN result; END IF;
 SELECT * INTO c FROM compagnies WHERE id=(p_scope->>'compagnie_id')::uuid FOR SHARE;
 SELECT * INTO aircraft FROM compagnie_avions WHERE id=(p_scope->>'compagnie_avion_id')::uuid FOR SHARE;
 effects:=company_development_effects_for_flight(c.id,aircraft.id,now(),p_scope->>'aeroport_depart',p_scope->>'aeroport_arrivee',p_scope->>'nature_transport');
 IF coalesce((effects->>'grounded')::boolean,false) THEN RAISE EXCEPTION 'Appareil immobilisé par une consigne constructeur'; END IF;
 IF coalesce((effects->>'inspection_required')::boolean,false) THEN RAISE EXCEPTION 'Inspection technique obligatoire avant un nouveau vol'; END IF;
 profile:=flight_economy_profile(aircraft.type_avion_id);
 minutes:=flight_economy_reference_minutes(p_scope->>'aeroport_depart',p_scope->>'aeroport_arrivee',aircraft.type_avion_id);
 liters:=ceil((profile->>'taxi_liters')::numeric+(profile->>'liters_hour')::numeric*minutes/60);
 base_fuel:=round(liters*1.2);
 fuel:=round(base_fuel*greatest(.1,1+coalesce((effects->>'fuel_percent')::numeric,0)/100));
 passenger:=coalesce((q.draw->>'nb_pax_genere')::numeric,0)*CASE WHEN p_scope->>'nature_transport'='cargo' THEN 0 ELSE (q.pricing->>'prix_billet_utilise')::numeric END;
 cargo:=greatest(0,(q.pricing->>'revenue_brut')::numeric-passenger);
 SELECT * INTO refs FROM flight_economy_tariff_reference WHERE company_id=c.id;
 IF NOT FOUND THEN
   INSERT INTO flight_economy_tariff_reference(company_id,ticket,kg) VALUES(c.id,coalesce(c.prix_billet_pax,0),coalesce(c.prix_kg_cargo,0)) ON CONFLICT DO NOTHING;
   SELECT * INTO refs FROM flight_economy_tariff_reference WHERE company_id=c.id;
 END IF;
 reference_ticket:=coalesce((refs.route_prices->>((p_scope->>'aeroport_depart')||':'||(p_scope->>'aeroport_arrivee')))::numeric,refs.ticket);
 reference_revenue:=coalesce((q.draw->>'nb_pax_genere')::numeric,0)*reference_ticket+coalesce((q.draw->>'cargo_kg_genere')::numeric,0)*refs.kg;
 IF EXISTS(SELECT 1 FROM atc_sessions WHERE aeroport IN (p_scope->>'aeroport_depart',p_scope->>'aeroport_arrivee')) THEN
   SELECT CASE WHEN p_candidate->>'flight_rules'='VFR' THEN taxe_vfr_pourcent ELSE taxe_pourcent END INTO reference_tax FROM taxes_aeroport WHERE code_oaci=p_scope->>'aeroport_arrivee';
   reference_tax:=greatest(0,least(95,coalesce(reference_tax,CASE WHEN p_candidate->>'flight_rules'='VFR' THEN 5 ELSE 2 END)));
 END IF;
 reference_allowance:=round(base_fuel/(1-reference_tax/100));
 -- Explicit transitional allowance: fixed standard fuel, capped by the original
 -- tariff reference and current receipt. No compensation for later fuel shocks.
 allowance:=least(reference_allowance,round(greatest(0,passenger+cargo)*.25),round(reference_allowance*least(1,(passenger+cargo)/greatest(1,reference_revenue))));
 modified:=round((passenger+cargo+allowance)*greatest(0,1+greatest(-70,least(70,coalesce((effects->>'revenue_percent')::numeric,0)))/100));
 SELECT * INTO lease FROM compagnie_locations WHERE avion_id=aircraft.id AND statut='active' AND start_at<=now() AND end_at>=now() ORDER BY id LIMIT 1 FOR SHARE;
 IF c.alliance_id IS NOT NULL THEN
   SELECT * INTO ap FROM alliance_parametres WHERE alliance_id=c.alliance_id FOR SHARE;
   IF FOUND THEN
     IF ap.codeshare_actif THEN
       SELECT greatest(0,least(100,coalesce(codeshare_pourcent,0))) INTO alliance_share FROM alliance_membres WHERE alliance_id=c.alliance_id AND compagnie_id=c.id;
       SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',compagnie_id) ORDER BY compagnie_id),'[]') INTO alliance_partners FROM alliance_membres WHERE alliance_id=c.alliance_id AND compagnie_id<>c.id;
     END IF;
     alliance_terms:=jsonb_build_object('alliance_id',c.alliance_id,'tax_percent',CASE WHEN ap.taxe_alliance_actif THEN greatest(0,least(100,coalesce(ap.taxe_alliance_pourcent,0))) ELSE 0 END,
       'share_percent',coalesce(alliance_share,0),'partners',alliance_partners);
   END IF;
 END IF;
 snap:=jsonb_build_object('version',2,'profile',profile,'reference_minutes',minutes,'passenger_revenue',passenger,'cargo_revenue',cargo,
   'transition_adjustment',allowance,'fuel_liters',liters,'fuel_cost',fuel,'fuel_cost_reference',base_fuel,'reference_tax_percent',reference_tax,
   'revenue_percent',greatest(-70,least(70,coalesce((effects->>'revenue_percent')::numeric,0))),
   'salary_total',(q.pricing->>'salaire_pilote')::numeric,'sensitive_cargo',coalesce(q.draw->>'type_cargaison','') IN ('express','perissable'),
   'ticket_price',q.pricing->'prix_billet_utilise','cargo_price',q.pricing->'prix_kg_cargo_utilise',
   'wifi_enabled',coalesce((effects->>'wifi_enabled')::boolean,false),'wifi_price',coalesce((effects->>'wifi_price')::numeric,0),
   'ife_level',coalesce((effects->>'ife_level')::numeric,0),'codeshare_partners',coalesce(effects->'codeshare_partners','[]'),
   'alliance_terms',alliance_terms,'lease_id',lease.id,'lessor_company_id',lease.loueur_compagnie_id,'lessor_percent',coalesce(lease.pourcentage_revenu_loueur,0),
   'airport_tax_percent',greatest(-90,least(300,coalesce((effects->>'airport_tax_percent')::numeric,0))),
   'seat_ratio',coalesce((effects->>'seat_ratio')::numeric,1),'reputation_demand_percent',reputation,'created_at',now());
 UPDATE flight_submission_quotes SET economy_snapshot=snap,pricing=pricing||jsonb_build_object('economy_version',2,'economy_snapshot',snap,'revenue_brut',modified) WHERE id=q.id RETURNING * INTO q;
 RETURN q.pricing||jsonb_build_object('quote_id',q.id,'expires_at',(q.utc_day+1)::timestamp AT TIME ZONE 'UTC');
END $$;

CREATE OR REPLACE FUNCTION public.submit_flight_plan_integrity(p_actor uuid,p_plan jsonb,p_quote uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q flight_submission_quotes%ROWTYPE; effects jsonb; enabled boolean; payload jsonb; lease compagnie_locations%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO q FROM flight_submission_quotes WHERE id=p_quote AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
 SELECT s.enabled INTO enabled FROM economy_release_settings s WHERE id;
 IF q.economy_snapshot IS NOT NULL AND NOT coalesce(enabled,false) THEN RAISE EXCEPTION 'Nouveaux vols économiques temporairement suspendus'; END IF;
 IF coalesce(enabled,false) AND p_plan->>'compagnie_avion_id' IS NOT NULL THEN
   effects:=company_development_effects_for_flight((p_plan->>'compagnie_id')::uuid,(p_plan->>'compagnie_avion_id')::uuid,now(),p_plan->>'aeroport_depart',p_plan->>'aeroport_arrivee',p_plan->>'nature_transport');
   IF coalesce((effects->>'grounded')::boolean,false) THEN RAISE EXCEPTION 'Appareil immobilisé par une consigne constructeur'; END IF;
   IF coalesce((effects->>'inspection_required')::boolean,false) THEN RAISE EXCEPTION 'Inspection technique obligatoire avant un nouveau vol'; END IF;
 END IF;
 IF q.economy_snapshot IS NOT NULL THEN
   SELECT * INTO lease FROM compagnie_locations WHERE avion_id=(p_plan->>'compagnie_avion_id')::uuid AND statut='active' AND start_at<=now() AND end_at>=now() ORDER BY id LIMIT 1 FOR SHARE;
   IF lease.id IS DISTINCT FROM (q.economy_snapshot->>'lease_id')::uuid OR
      lease.loueur_compagnie_id IS DISTINCT FROM (q.economy_snapshot->>'lessor_company_id')::uuid OR
      coalesce(lease.pourcentage_revenu_loueur,0) IS DISTINCT FROM coalesce((q.economy_snapshot->>'lessor_percent')::numeric,0) THEN
      RAISE EXCEPTION 'Le contrat de location a changé depuis le devis';
   END IF;
 END IF;
 payload:=p_plan||jsonb_build_object('economy_version',CASE WHEN q.economy_snapshot IS NULL THEN 1 ELSE 2 END,'economy_snapshot',q.economy_snapshot);
 -- The historical display column is INTEGER and is used by a deployed view.
 -- Keep it compatible; exact cents remain in the locked quote and v2 snapshot.
 -- This temporary projection is invisible outside the transaction and restored
 -- before returning. A failure rolls it back together with the submission.
 UPDATE flight_submission_quotes SET pricing=pricing||jsonb_build_object('prix_billet_utilise',round((pricing->>'prix_billet_utilise')::numeric)::bigint) WHERE id=q.id;
 result:=submit_flight_plan_integrity_legacy(p_actor,payload,p_quote);
 UPDATE flight_submission_quotes SET pricing=q.pricing WHERE id=q.id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.flight_economy_actual_departure(p_accepted timestamptz,p_atd text,p_close timestamptz) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE atd text; departure timestamptz:=p_accepted;
BEGIN
 atd:=regexp_replace(lower(trim(coalesce(p_atd,''))),'[h:]','','g');
 IF atd ~ '^[0-9]{3,4}$' THEN atd:=lpad(atd,4,'0'); ELSE atd:=NULL; END IF;
 IF atd ~ '^([0-1][0-9]|2[0-3])[0-5][0-9]$' THEN
   departure:=((p_accepted AT TIME ZONE 'UTC')::date+(substring(atd,1,2)||':'||substring(atd,3,2))::time) AT TIME ZONE 'UTC';
   IF departure<p_accepted THEN departure:=departure+interval '1 day'; END IF;
   IF departure>p_close THEN departure:=p_accepted; END IF;
 END IF;
 RETURN departure;
END $$;
-- New plans cannot change economic contracts or the first eligible closure
-- timestamp. A premature rejected attempt can be cleared and retried later.
CREATE OR REPLACE FUNCTION public.guard_flight_economy_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE minimum numeric; valid_first boolean;
BEGIN
 IF OLD.economy_version=2 THEN
   IF NEW.statut IS DISTINCT FROM 'cloture' AND EXISTS(SELECT 1 FROM flight_economy_settlements WHERE plan_id=OLD.id) THEN
     RAISE EXCEPTION 'Un vol réglé et clôturé ne peut plus être rouvert ou annulé';
   END IF;
   IF NEW.economy_version IS DISTINCT FROM OLD.economy_version OR NEW.economy_snapshot IS DISTINCT FROM OLD.economy_snapshot OR
      NEW.revenue_brut IS DISTINCT FROM OLD.revenue_brut OR NEW.salaire_pilote IS DISTINCT FROM OLD.salaire_pilote OR
      NEW.nb_pax_genere IS DISTINCT FROM OLD.nb_pax_genere OR NEW.cargo_kg_genere IS DISTINCT FROM OLD.cargo_kg_genere OR
      NEW.heure_depart_estimee IS DISTINCT FROM OLD.heure_depart_estimee OR NEW.compagnie_avion_id IS DISTINCT FROM OLD.compagnie_avion_id OR
      NEW.compagnie_id IS DISTINCT FROM OLD.compagnie_id OR NEW.pilote_id IS DISTINCT FROM OLD.pilote_id OR
      (OLD.accepted_at IS NOT NULL AND NEW.copilote_id IS DISTINCT FROM OLD.copilote_id) THEN
      RAISE EXCEPTION 'Le devis économique de ce vol est immuable';
   END IF;
   IF OLD.accepted_at IS NOT NULL THEN NEW.accepted_at:=OLD.accepted_at; END IF;
   minimum:=least((OLD.economy_snapshot->>'reference_minutes')::numeric,greatest(2,floor((OLD.economy_snapshot->>'reference_minutes')::numeric*.2)));
   valid_first:=OLD.demande_cloture_at IS NOT NULL AND OLD.accepted_at IS NOT NULL AND
     extract(epoch FROM(OLD.demande_cloture_at-flight_economy_actual_departure(OLD.accepted_at,OLD.strip_atd,OLD.demande_cloture_at)))/60>=minimum;
   IF coalesce(valid_first,false) THEN NEW.demande_cloture_at:=OLD.demande_cloture_at;
   ELSIF NEW.demande_cloture_at IS NOT NULL THEN NEW.demande_cloture_at:=now(); END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_flight_economy_snapshot ON public.plans_vol;
CREATE TRIGGER guard_flight_economy_snapshot BEFORE UPDATE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_flight_economy_snapshot();

CREATE OR REPLACE FUNCTION public.guard_new_flight_development_restrictions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE effects jsonb;
BEGIN
 IF NEW.compagnie_avion_id IS NULL OR NEW.compagnie_id IS NULL OR
    NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF (OLD.accepted_at IS NOT NULL AND OLD.statut NOT IN ('annule','refuse')) OR
      NEW.statut NOT IN ('depose','en_attente','en_attente_copilote','accepte','en_cours','automonitoring') THEN RETURN NEW; END IF;
 END IF;
 effects:=company_development_effects_for_flight(NEW.compagnie_id,NEW.compagnie_avion_id,now(),NEW.aeroport_depart,NEW.aeroport_arrivee,NEW.nature_transport);
 IF coalesce((effects->>'grounded')::boolean,false) THEN RAISE EXCEPTION 'Appareil immobilisé par une consigne constructeur'; END IF;
 IF coalesce((effects->>'inspection_required')::boolean,false) THEN RAISE EXCEPTION 'Inspection technique obligatoire avant un nouveau vol'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_new_flight_development_restrictions ON public.plans_vol;
CREATE TRIGGER guard_new_flight_development_restrictions BEFORE INSERT OR UPDATE OF statut ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_new_flight_development_restrictions();

-- Account creation and every movement happen inside the settlement transaction.
CREATE OR REPLACE FUNCTION public.flight_economy_account(p_company uuid DEFAULT NULL,p_user uuid DEFAULT NULL,p_alliance uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE account uuid; bank text; kind text; owner_key text;
BEGIN
 IF num_nonnulls(p_company,p_user,p_alliance)<>1 THEN RAISE EXCEPTION 'Bénéficiaire bancaire invalide'; END IF;
 kind:=CASE WHEN p_company IS NOT NULL THEN 'entreprise' WHEN p_user IS NOT NULL THEN 'personnel' ELSE 'alliance' END;
 owner_key:=coalesce(p_company,p_user,p_alliance)::text;
 PERFORM pg_advisory_xact_lock(hashtextextended('economy-account:'||kind||owner_key,0));
 SELECT id INTO account FROM felitz_comptes WHERE type=kind AND
   (compagnie_id=p_company OR proprietaire_id=p_user OR alliance_id=p_alliance) ORDER BY created_at,id LIMIT 1;
 IF account IS NULL THEN
   IF p_company IS NOT NULL THEN
     SELECT vban INTO bank FROM compagnies WHERE id=p_company FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Compagnie bénéficiaire introuvable'; END IF;
   ELSIF p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user) THEN RAISE EXCEPTION 'Pilote bénéficiaire introuvable'; END IF;
   bank:=coalesce(nullif(bank,''),CASE WHEN kind='entreprise' THEN 'ENTERMIXOU' ELSE 'MIXOU' END||upper(replace(gen_random_uuid()::text,'-','')));
   INSERT INTO felitz_comptes(type,compagnie_id,proprietaire_id,alliance_id,vban,solde) VALUES(kind,p_company,p_user,p_alliance,bank,0) RETURNING id INTO account;
   IF p_company IS NOT NULL THEN UPDATE compagnies SET vban=bank WHERE id=p_company; END IF;
 END IF;
 RETURN account;
END $$;
CREATE OR REPLACE FUNCTION public.flight_economy_post(p_account uuid,p_amount bigint,p_label text,p_plan uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_amount=0 THEN RETURN; END IF;
 UPDATE felitz_comptes SET solde=solde+p_amount WHERE id=p_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'Compte de règlement introuvable'; END IF;
 INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(p_account,CASE WHEN p_amount>0 THEN 'credit' ELSE 'debit' END,abs(p_amount),p_label||' · '||p_plan::text);
END $$;

CREATE OR REPLACE FUNCTION public.settle_flight_economy(p_plan uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; c compagnies%ROWTYPE; snap jsonb; prior jsonb; detail jsonb; r record;
 close_at timestamptz; departure_at timestamptz; scheduled_at timestamptz; reference numeric; actual numeric; delay numeric; normal_loss numeric; cargo_loss numeric; atd text;
 base numeric; modified bigint; passenger bigint; cargo bigint; receipt bigint; tax bigint:=0; rate numeric; fuel bigint; salary bigint; copay bigint; net bigint;
 company_account uuid; pilot_account uuid; copilot_account uuid; account uuid; royalty bigint:=0; alliance_tax bigint:=0; codeshare bigint:=0; repay bigint:=0;
 count_tax integer; remaining bigint; part bigint; tax_rows integer; i integer:=0; ap alliance_parametres%ROWTYPE; loan prets_bancaires%ROWTYPE; cs_pct numeric; partner jsonb; cs_base bigint;
 airport_budget bigint; airport_remaining bigint; tax_user uuid; user_index integer;
 wear numeric; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-economy-settlement:v2',0));
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plan introuvable'; END IF;
 SELECT s.detail INTO prior FROM flight_economy_settlements s WHERE plan_id=p_plan;
 IF FOUND THEN RETURN prior; END IF;
 IF p.economy_version<>2 OR p.economy_snapshot IS NULL OR NOT p.vol_commercial OR p.compagnie_id IS NULL OR p.accepted_at IS NULL OR
    p.statut NOT IN ('accepte','en_cours','automonitoring','en_attente_cloture','cloture') THEN RAISE EXCEPTION 'Vol non éligible au règlement version 2'; END IF;
 snap:=p.economy_snapshot;
 close_at:=coalesce(p.demande_cloture_at,p.cloture_at,now());
 IF close_at>now()+interval '5 seconds' THEN RAISE EXCEPTION 'Horaire de clôture invalide'; END IF;
 departure_at:=flight_economy_actual_departure(p.accepted_at,p.strip_atd,close_at);
 reference:=(snap->>'reference_minutes')::numeric;
 actual:=extract(epoch FROM(close_at-departure_at))/60;
 IF actual<least(reference,greatest(2,floor(reference*.2))) THEN RAISE EXCEPTION 'Durée de vol anormalement courte : vérification requise'; END IF;
 scheduled_at:=least(coalesce(p.heure_depart_estimee,p.accepted_at),p.accepted_at);
 delay:=greatest(0,extract(epoch FROM(close_at-scheduled_at))/60-reference);
 normal_loss:=least(15,greatest(0,delay-5)*.5);
 cargo_loss:=CASE WHEN (snap->>'sensitive_cargo')::boolean THEN least(25,greatest(0,delay-5)) ELSE 0 END;
 base:=(snap->>'passenger_revenue')::numeric+(snap->>'cargo_revenue')::numeric;
 modified:=round((base+(snap->>'transition_adjustment')::numeric)*greatest(0,1+(snap->>'revenue_percent')::numeric/100));
 passenger:=CASE WHEN base>0 THEN round(modified*(snap->>'passenger_revenue')::numeric/base) ELSE 0 END;
 cargo:=modified-passenger;
 passenger:=round(passenger*(1-normal_loss/100)); cargo:=round(cargo*greatest(0,1-(normal_loss+cargo_loss)/100));
 receipt:=round((passenger+cargo)*CASE WHEN p.deroutement_at IS NOT NULL THEN .5 ELSE 1 END);
 fuel:=(snap->>'fuel_cost')::bigint; salary:=(snap->>'salary_total')::bigint;
 SELECT CASE WHEN p.type_vol='VFR' THEN taxe_vfr_pourcent ELSE taxe_pourcent END INTO rate FROM taxes_aeroport WHERE code_oaci=p.aeroport_arrivee;
 rate:=greatest(0,least(100,coalesce(rate,CASE WHEN p.type_vol='VFR' THEN 5 ELSE 2 END)));
 SELECT count(*) INTO count_tax FROM (SELECT DISTINCT user_id,aeroport FROM atc_plans_controles WHERE plan_vol_id=p.id) x;
 IF count_tax>0 OR p.current_afis_user_id IS NOT NULL OR p.deroutement_at IS NOT NULL THEN tax:=round(receipt*rate/100*(1+coalesce((snap->>'airport_tax_percent')::numeric,0)/100)*CASE WHEN p.deroutement_at IS NOT NULL THEN 20 ELSE 1 END); END IF;
 SELECT * INTO c FROM compagnies WHERE id=p.compagnie_id FOR SHARE;
 company_account:=flight_economy_account(p_company=>c.id);pilot_account:=flight_economy_account(p_user=>p.pilote_id);
 IF p.copilote_id IS NOT NULL AND p.copilote_id<>p.pilote_id THEN copilot_account:=flight_economy_account(p_user=>p.copilote_id); END IF;
 PERFORM flight_economy_post(company_account,receipt,'Recette vol',p.id);
 PERFORM flight_economy_post(company_account,-fuel,'Facture carburant (une seule fois)',p.id);
 PERFORM flight_economy_post(company_account,-tax,'Taxes aéroportuaires '||p.aeroport_arrivee||CASE WHEN p.deroutement_at IS NOT NULL THEN ' ×20' ELSE '' END,p.id);
 PERFORM flight_economy_post(company_account,-salary,'Salaire équipage garanti',p.id);
 copay:=CASE WHEN copilot_account IS NOT NULL THEN floor(salary/2.0) ELSE 0 END;
 PERFORM flight_economy_post(pilot_account,salary-copay,'Salaire commandant',p.id);
 IF copilot_account IS NOT NULL THEN PERFORM flight_economy_post(copilot_account,copay,'Salaire copilote',p.id); END IF;
 net:=receipt-fuel-tax-salary;
 -- Contracts redistribute an actual remaining positive receipt; they do not
 -- manufacture a second revenue bonus, and never reduce the guaranteed salary.
 IF snap->>'lessor_company_id' IS NOT NULL THEN
   royalty:=greatest(0,round(greatest(0,receipt-tax)*greatest(0,least(100,coalesce((snap->>'lessor_percent')::numeric,0)))/100));
   account:=flight_economy_account(p_company=>(snap->>'lessor_company_id')::uuid);
   PERFORM flight_economy_post(company_account,-royalty,'Part du bailleur',p.id);PERFORM flight_economy_post(account,royalty,'Revenu location',p.id);net:=net-royalty;
 END IF;
 IF snap->'alliance_terms'->>'alliance_id' IS NOT NULL AND net>0 THEN
   IF coalesce((snap->'alliance_terms'->>'tax_percent')::numeric,0)>0 THEN
     alliance_tax:=round(net*greatest(0,least(100,(snap->'alliance_terms'->>'tax_percent')::numeric))/100);
     account:=flight_economy_account(p_alliance=>(snap->'alliance_terms'->>'alliance_id')::uuid);
     PERFORM flight_economy_post(company_account,-alliance_tax,'Contribution alliance',p.id);PERFORM flight_economy_post(account,alliance_tax,'Contribution compagnie',p.id);net:=net-alliance_tax;
   END IF;
   IF net>0 THEN
     cs_pct:=coalesce((snap->'alliance_terms'->>'share_percent')::numeric,0);
     tax_rows:=jsonb_array_length(coalesce(snap->'alliance_terms'->'partners','[]'));
     IF tax_rows>0 THEN
       remaining:=round(net*greatest(0,least(100,coalesce(cs_pct,0)))/100);part:=floor(remaining::numeric/tax_rows);
       FOR partner IN SELECT value FROM jsonb_array_elements(snap->'alliance_terms'->'partners') LOOP
         account:=flight_economy_account(p_company=>(partner->>'company_id')::uuid);PERFORM flight_economy_post(account,part,'Codeshare alliance',p.id);codeshare:=codeshare+part;
       END LOOP;
       PERFORM flight_economy_post(company_account,-codeshare,'Partage codeshare alliance',p.id);net:=net-codeshare;
     END IF;
   END IF;
 END IF;
 cs_base:=greatest(0,net);
 FOR partner IN SELECT value FROM jsonb_array_elements(coalesce(snap->'codeshare_partners','[]')) LOOP
   IF partner->>'company_id'=c.id::text THEN CONTINUE; END IF;
   part:=least(greatest(0,net),round(cs_base*greatest(0,least(100,coalesce((partner->>'percent')::numeric,0)))/100));
   IF part>0 THEN
     account:=flight_economy_account(p_company=>(partner->>'company_id')::uuid);
     PERFORM flight_economy_post(company_account,-part,'Contrat codeshare',p.id);PERFORM flight_economy_post(account,part,'Contrat codeshare',p.id);net:=net-part;codeshare:=codeshare+part;
   END IF;
 END LOOP;
 IF net>0 THEN
   SELECT * INTO loan FROM prets_bancaires WHERE compagnie_id=c.id AND statut='actif' ORDER BY id LIMIT 1 FOR UPDATE;
   IF FOUND THEN
     repay:=least(round(net*.30),greatest(0,loan.montant_total_du-loan.montant_rembourse));
     UPDATE prets_bancaires SET montant_rembourse=montant_rembourse+repay,statut=CASE WHEN montant_rembourse+repay>=montant_total_du THEN 'rembourse' ELSE statut END,
       rembourse_at=CASE WHEN montant_rembourse+repay>=montant_total_du THEN now() ELSE rembourse_at END WHERE id=loan.id;
     PERFORM flight_economy_post(company_account,-repay,'Remboursement prêt',p.id);net:=net-repay;
   END IF;
 END IF;
 IF tax>0 AND count_tax>0 THEN
   remaining:=tax;
   SELECT count(DISTINCT aeroport) INTO tax_rows FROM atc_plans_controles WHERE plan_vol_id=p.id;
   FOR r IN SELECT aeroport,array_agg(DISTINCT user_id ORDER BY user_id) users FROM atc_plans_controles WHERE plan_vol_id=p.id GROUP BY aeroport ORDER BY aeroport LOOP
     i:=i+1;airport_budget:=CASE WHEN i=tax_rows THEN remaining ELSE floor(tax::numeric/tax_rows) END;remaining:=remaining-airport_budget;airport_remaining:=airport_budget;user_index:=0;
     FOREACH tax_user IN ARRAY r.users LOOP
       user_index:=user_index+1;part:=CASE WHEN user_index=array_length(r.users,1) THEN airport_remaining ELSE floor(airport_budget::numeric/array_length(r.users,1)) END;airport_remaining:=airport_remaining-part;
       account:=flight_economy_account(p_user=>tax_user);PERFORM flight_economy_post(account,part,'Taxes ATC '||r.aeroport,p.id);
     END LOOP;
   END LOOP;
 ELSIF tax>0 AND p.current_afis_user_id IS NOT NULL THEN
   account:=flight_economy_account(p_user=>p.current_afis_user_id);PERFORM flight_economy_post(account,tax,'Taxes AFIS',p.id);
 END IF;
 wear:=greatest(1,floor(actual/15))*2;
 UPDATE compagnie_avions SET usure_percent=greatest(0,usure_percent-wear),statut=CASE WHEN usure_percent-wear<=0 THEN 'bloque' ELSE 'ground' END,aeroport_actuel=p.aeroport_arrivee WHERE id=p.compagnie_avion_id;
 detail:=jsonb_build_object('version',2,'plan_id',p.id,'gross_revenue',receipt,'company_net',net,'salary_total',salary,'captain_salary',salary-copay,'copilot_salary',copay,
   'airport_tax',tax,'tax_rate_percent',rate,'tax_airport',p.aeroport_arrivee,'fuel_cost',fuel,'fuel_liters',snap->'fuel_liters','transition_adjustment',snap->'transition_adjustment',
   'reference_minutes',reference,'actual_minutes',actual,'delay_minutes',delay,'delay_discount_percent',normal_loss,'cargo_delay_discount_percent',cargo_loss,
   'passenger_revenue',passenger,'cargo_revenue',cargo,'diverted',p.deroutement_at IS NOT NULL,'wifi_enabled',snap->'wifi_enabled','wifi_price',snap->'wifi_price','ife_level',snap->'ife_level',
   'leased',royalty,'alliance_tax',alliance_tax,'codeshare',codeshare,'loan_repayment',repay,'wear_applied',wear,'closed_at',close_at);
 INSERT INTO flight_economy_settlements(plan_id,detail) VALUES(p.id,detail);
 UPDATE plans_vol SET revenue_effectif=receipt,revenue_net=net,statut='cloture',cloture_at=coalesce(cloture_at,now()),demande_cloture_at=coalesce(demande_cloture_at,close_at) WHERE id=p.id;
 UPDATE aeroports SET last_flight_arrival=close_at WHERE code_oaci=p.aeroport_arrivee;
 INSERT INTO messages(destinataire_id,titre,contenu,type_message,metadata) VALUES(p.pilote_id,'Règlement vol '||p.numero_vol,
   'Vol clôturé. Salaire équipage garanti : '||salary||' F$. Montant crédité sur Felitz Bank.','systeme',jsonb_build_object('plan_vol_id',p.id,'economy_version',2));
 IF c.pdg_id IS NOT NULL THEN INSERT INTO messages(destinataire_id,titre,contenu,type_message,metadata) VALUES(c.pdg_id,'Bilan vol '||p.numero_vol,
   'Recette : '||receipt||' F$ ; carburant : '||fuel||' F$ ; taxes : '||tax||' F$ ; salaire : '||salary||' F$ ; résultat compagnie : '||net||' F$. Règlement enregistré sur Felitz Bank.','systeme',jsonb_build_object('plan_vol_id',p.id,'economy_version',2)); END IF;
 PERFORM publish_flight_review(p.id);
 RETURN detail;
END $$;

CREATE OR REPLACE FUNCTION public.force_close_flight_economy(p_plan uuid,p_admin uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p plans_vol%ROWTYPE; result jsonb; settlement jsonb; cancelled boolean; fine bigint; account uuid; bank text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-economy-settlement:v2',0));
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_admin AND role='admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
 SELECT * INTO p FROM plans_vol WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND OR p.economy_version<>2 THEN RAISE EXCEPTION 'Plan économique introuvable'; END IF;
 SELECT a.result INTO result FROM flight_economy_admin_closures a WHERE plan_id=p_plan;
 IF FOUND THEN RETURN result; END IF;
 IF p.statut IN ('cloture','annule') THEN RAISE EXCEPTION 'Ce plan est déjà terminé'; END IF;
 cancelled:=p.accepted_at IS NULL OR now()-coalesce(p.accepted_at,p.created_at)>interval '24 hours';
 fine:=CASE WHEN cancelled THEN 100000 ELSE 50000 END;
 IF NOT cancelled THEN settlement:=settle_flight_economy(p.id); END IF;
 account:=flight_economy_account(p_company=>p.compagnie_id);
 PERFORM flight_economy_post(account,-fine,'Amende administrative '||CASE WHEN cancelled THEN 'annulation' ELSE 'clôture' END||' forcée',p.id);
 SELECT vban INTO bank FROM felitz_comptes WHERE id=account;
 UPDATE plans_vol SET statut=CASE WHEN cancelled THEN 'annule' ELSE 'cloture' END,cloture_at=coalesce(cloture_at,now()),
   current_holder_user_id=NULL,current_holder_position=NULL,current_holder_aeroport=NULL,automonitoring=false,
   pending_transfer_aeroport=NULL,pending_transfer_position=NULL,pending_transfer_at=NULL WHERE id=p.id;
 result:=jsonb_build_object('ok',true,'statut',CASE WHEN cancelled THEN 'annule' ELSE 'cloture' END,'annule',cancelled,
   'amende',fine,'amendeAppliquee',true,'compteDebite',bank,'reglement',settlement);
 INSERT INTO flight_economy_admin_closures(plan_id,result) VALUES(p.id,result);
 INSERT INTO messages(destinataire_id,titre,contenu,type_message,metadata) VALUES(p.pilote_id,
   'Plan '||p.numero_vol||CASE WHEN cancelled THEN ' annulé' ELSE ' clôturé' END||' par un administrateur',
   'Amende administrative : '||fine||' F$, enregistrée séparément sur le compte de la compagnie.'||CASE WHEN cancelled THEN ' Vol non effectué : aucun règlement commercial.' ELSE ' Le salaire garanti et le règlement du vol ont été crédités sur Felitz Bank.' END,
   'systeme',jsonb_build_object('plan_vol_id',p.id,'economy_version',2,'admin_id',p_admin));
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_flight_submission_quote_legacy(uuid,jsonb,jsonb),public.submit_flight_plan_integrity_legacy(uuid,jsonb,uuid),
 public.flight_economy_profile(uuid),public.flight_economy_reference_minutes(text,text,uuid),public.flight_economy_account(uuid,uuid,uuid),public.flight_economy_post(uuid,bigint,text,uuid),
 public.get_flight_submission_quote(uuid,jsonb,jsonb),public.submit_flight_plan_integrity(uuid,jsonb,uuid),public.settle_flight_economy(uuid),public.force_close_flight_economy(uuid,uuid),
 public.flight_economy_actual_departure(timestamptz,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_flight_submission_quote(uuid,jsonb,jsonb),public.submit_flight_plan_integrity(uuid,jsonb,uuid),public.settle_flight_economy(uuid),public.force_close_flight_economy(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
