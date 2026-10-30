-- Additive correction: use the actual flight activity, not the aircraft layout.
-- Existing quotes, settlements, balances and research projects stay unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.company_development_effects_for_flight(p_company uuid,p_aircraft uuid,p_at timestamptz DEFAULT now(),p_departure text DEFAULT NULL,p_arrival text DEFAULT NULL,p_activity text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s company_service_settings%ROWTYPE; e company_global_events%ROWTYPE; revenue numeric:=0; research numeric:=0; fuel numeric:=0; repair numeric:=0; delay numeric:=0; taxes numeric:=0; grounded boolean:=false; inspect boolean:=false; shares jsonb:='[]'; total_share numeric:=0; passenger boolean:=false; freight boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN jsonb_build_object('revenue_percent',0,'fuel_percent',0,'repair_percent',0,'repair_delay_percent',0,'airport_tax_percent',0,'grounded',false,'inspection_required',false,'seat_ratio',1,'wifi_enabled',false,'wifi_price',0,'ife_level',0,'codeshare_percent',0,'codeshare_partners','[]'::jsonb); END IF;
 -- Explicit flight activity controls passenger-only services and RSE eligibility.
 -- Calls without an activity retain the historical aircraft-capacity fallback.
 IF p_activity IS NULL THEN
  SELECT t.capacite_pax>0,t.est_cargo OR (t.capacite_pax=0 AND t.capacite_cargo_kg>0) INTO passenger,freight FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.id=p_aircraft;
 ELSE
  passenger:=p_activity='passagers';
  freight:=p_activity='cargo';
 END IF;
 passenger:=coalesce(passenger,false); freight:=coalesce(freight,false);
 SELECT * INTO s FROM company_service_settings WHERE company_id=p_company;
 SELECT coalesce(sum(r.revenue_percent),0) INTO research FROM company_research_projects p JOIN company_research_catalog r ON r.id=p.research_id WHERE p.company_id=p_company AND p.ready_at<=p_at;
 SELECT coalesce(sum(c.revenue_percent),0) INTO revenue FROM company_rse_commitments c JOIN company_rse_catalog r ON r.id=c.catalog_id WHERE c.company_id=p_company AND c.active_at<=p_at AND company_development_target_valid(p_company,c.target_type,c.target_id)
  AND (c.target_type<>'appareil' OR c.target_id=p_aircraft)
  AND (c.target_type<>'liaison' OR EXISTS(SELECT 1 FROM tarifs_liaisons l WHERE l.id=c.target_id AND (l.aeroport_depart=p_departure AND l.aeroport_arrivee=p_arrival OR coalesce((to_jsonb(l)->>'bidirectionnel')::boolean,false) AND l.aeroport_depart=p_arrival AND l.aeroport_arrivee=p_departure)))
  AND (c.target_type NOT IN ('batiment','site','base','hub') OR EXISTS(SELECT 1 FROM compagnie_hubs h WHERE h.id=c.target_id AND h.aeroport_code IN(p_departure,p_arrival)))
  AND (r.activity='toutes' OR r.activity='passagers' AND passenger OR r.activity='cargo' AND freight);
 revenue:=greatest(-25,least(20,revenue))+least(10,research);
 IF passenger AND s.wifi_enabled THEN
  -- F$/Mo: reasonable paid tariffs help ancillary revenue; excessive tariffs
  -- reduce demand. Free connectivity is a small service attractiveness bonus.
  revenue:=revenue+CASE WHEN s.wifi_price=0 THEN 1 WHEN s.wifi_price<=1 THEN 0.5 WHEN s.wifi_price<=5 THEN 0.25 WHEN s.wifi_price<=10 THEN 0 WHEN s.wifi_price<=25 THEN -0.5 WHEN s.wifi_price<=50 THEN -1 ELSE -2 END;
 END IF;
 IF passenger THEN revenue:=revenue+coalesce(s.ife_level,0)*0.2; END IF;
 SELECT * INTO e FROM company_global_events WHERE starts_at<=p_at AND ends_at>p_at ORDER BY starts_at DESC LIMIT 1;
 IF FOUND AND company_development_selector_matches_context(e.selector,p_company,p_aircraft,p_departure,p_arrival,p_activity) THEN
  revenue:=revenue+coalesce((e.effects->>'revenue_percent')::numeric,0);fuel:=coalesce((e.effects->>'fuel_percent')::numeric,0);repair:=coalesce((e.effects->>'repair_percent')::numeric,0);delay:=coalesce((e.effects->>'repair_delay_percent')::numeric,0);taxes:=coalesce((e.effects->>'airport_tax_percent')::numeric,0);
  grounded:=coalesce((e.effects->>'grounded')::boolean,false) AND NOT coalesce((e.effects->>'inspection_required')::boolean,false);
  IF coalesce((e.effects->>'inspection_required')::boolean,false) AND p_aircraft IS NOT NULL THEN
   INSERT INTO company_development_inspections(event_id,aircraft_id,company_id,required_at) VALUES(e.id,p_aircraft,p_company,e.starts_at) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 -- Inspection obligation survives the monthly effect's expiry until a verified
 -- maintenance cycle begun after publication has actually completed.
 SELECT EXISTS(SELECT 1 FROM company_development_inspections WHERE aircraft_id=p_aircraft AND completed_at IS NULL) INTO inspect;
 grounded:=grounded OR inspect;
 SELECT coalesce(sum(share_percent),0),coalesce(jsonb_agg(jsonb_build_object('company_id',CASE WHEN proposer_company_id=p_company THEN partner_company_id ELSE proposer_company_id END,'percent',share_percent)),'[]'::jsonb) INTO total_share,shares FROM company_development_codeshares WHERE status='active' AND p_company IN(proposer_company_id,partner_company_id) AND accepted_at<=p_at;
 RETURN jsonb_build_object('revenue_percent',greatest(-40,least(40,revenue)),'fuel_percent',greatest(-50,least(100,fuel)),'repair_percent',greatest(-50,least(200,repair)),'repair_delay_percent',greatest(-50,least(200,delay)),'airport_tax_percent',greatest(-50,least(100,taxes)),'grounded',grounded,'inspection_required',inspect,'seat_ratio',CASE WHEN passenger THEN coalesce(s.seat_ratio,1) ELSE 1 END,'wifi_enabled',passenger AND coalesce(s.wifi_enabled,false),'wifi_price',coalesce(s.wifi_price,0),'ife_level',CASE WHEN passenger THEN coalesce(s.ife_level,0) ELSE 0 END,'codeshare_percent',least(15,total_share),'codeshare_partners',shares);
END $$;
REVOKE ALL ON FUNCTION public.company_development_effects_for_flight(uuid,uuid,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.company_development_effects_for_flight(uuid,uuid,timestamptz,text,text,text) TO service_role;

-- Ferry orders do not go through plans_vol. Reject new departures before the
-- API can debit their cost, while preserving ferries already engaged earlier.
CREATE OR REPLACE FUNCTION public.guard_new_ferry_development_restrictions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid; effects jsonb; context jsonb:=to_jsonb(NEW);
BEGIN
 IF NEW.avion_id IS NULL OR NEW.statut NOT IN ('planned','in_progress') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.avion_id IS NOT DISTINCT FROM NEW.avion_id AND OLD.statut IN ('planned','in_progress') THEN RETURN NEW; END IF;
 SELECT compagnie_id INTO company FROM compagnie_avions WHERE id=NEW.avion_id FOR UPDATE;
 company:=coalesce((context->>'compagnie_id')::uuid,company);
 IF company IS NULL THEN RAISE EXCEPTION 'Appareil ou compagnie du ferry introuvable'; END IF;
 effects:=company_development_effects_for_flight(company,NEW.avion_id,now(),context->>'aeroport_depart',context->>'aeroport_arrivee',NULL);
 IF coalesce((effects->>'inspection_required')::boolean,false) THEN RAISE EXCEPTION 'Inspection technique obligatoire avant un nouveau ferry'; END IF;
 IF coalesce((effects->>'grounded')::boolean,false) THEN RAISE EXCEPTION 'Appareil immobilisé par une consigne constructeur'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_new_ferry_development_restrictions ON public.vols_ferry;
CREATE TRIGGER guard_new_ferry_development_restrictions BEFORE INSERT OR UPDATE ON public.vols_ferry
 FOR EACH ROW EXECUTE FUNCTION public.guard_new_ferry_development_restrictions();
REVOKE ALL ON FUNCTION public.guard_new_ferry_development_restrictions() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
