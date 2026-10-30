-- Persistent company research/RSE/services and one global monthly event.
-- Catalogues are seeded by a trusted server process, never shipped to browsers.
BEGIN;
CREATE TABLE IF NOT EXISTS public.economy_release_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,activated_at timestamptz,config_version text NOT NULL DEFAULT '2026-10-30');
INSERT INTO public.economy_release_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.company_research_catalog(id text PRIMARY KEY,title text NOT NULL,domain text NOT NULL,description text NOT NULL,panel text NOT NULL DEFAULT '',unlock_key text NOT NULL,cost bigint NOT NULL CHECK(cost>0),delay_seconds integer NOT NULL CHECK(delay_seconds>0),prerequisites text[] NOT NULL DEFAULT '{}',revenue_percent numeric NOT NULL DEFAULT 0 CHECK(revenue_percent BETWEEN 0 AND 1));
CREATE TABLE IF NOT EXISTS public.company_rse_catalog(id text PRIMARY KEY,title text NOT NULL,domain text NOT NULL,description text NOT NULL,research_id text REFERENCES public.company_research_catalog(id),cost bigint NOT NULL CHECK(cost>0),delay_seconds integer NOT NULL CHECK(delay_seconds>0),target_type text NOT NULL,activity text NOT NULL DEFAULT 'toutes',starter boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS public.company_event_catalog(id text PRIMARY KEY,scenario_id text NOT NULL,title text NOT NULL,description text NOT NULL,selector text NOT NULL DEFAULT 'toutes',effects jsonb NOT NULL,duration_days integer NOT NULL CHECK(duration_days BETWEEN 1 AND 30));
CREATE TABLE IF NOT EXISTS public.company_development_secrets(id boolean PRIMARY KEY DEFAULT true CHECK(id),signing_key bytea NOT NULL);
INSERT INTO public.company_development_secrets VALUES(true,decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex')) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.company_research_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,research_id text NOT NULL REFERENCES public.company_research_catalog(id),cost bigint NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),ready_at timestamptz NOT NULL,actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,UNIQUE(company_id,research_id));
CREATE TABLE IF NOT EXISTS public.company_development_cycles(company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,month date NOT NULL,used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 5),refilled_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,month));
CREATE TABLE IF NOT EXISTS public.company_rse_hands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,catalog_id text NOT NULL REFERENCES public.company_rse_catalog(id),target_type text NOT NULL,target_id uuid NOT NULL,offer_month date NOT NULL,status text NOT NULL DEFAULT 'offered' CHECK(status IN ('offered','committed','discarded')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS company_rse_hands_company_status_idx ON public.company_rse_hands(company_id,status);
CREATE TABLE IF NOT EXISTS public.company_rse_commitments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,hand_id uuid NOT NULL UNIQUE REFERENCES public.company_rse_hands(id),catalog_id text NOT NULL REFERENCES public.company_rse_catalog(id),target_type text NOT NULL,target_id uuid NOT NULL,cost bigint NOT NULL,revenue_percent numeric NOT NULL,committed_at timestamptz NOT NULL DEFAULT now(),active_at timestamptz NOT NULL,actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,signature text NOT NULL,UNIQUE(company_id,catalog_id,target_type,target_id));
CREATE TABLE IF NOT EXISTS public.company_development_operations(company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,token uuid NOT NULL,action text NOT NULL,resource text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,token));
CREATE TABLE IF NOT EXISTS public.company_service_settings(company_id uuid PRIMARY KEY REFERENCES public.compagnies(id) ON DELETE CASCADE,wifi_enabled boolean NOT NULL DEFAULT false,wifi_price numeric NOT NULL DEFAULT 0 CHECK(wifi_price BETWEEN 0 AND 100),seat_ratio numeric NOT NULL DEFAULT 1 CHECK(seat_ratio BETWEEN 0.7 AND 1),ife_level integer NOT NULL DEFAULT 0 CHECK(ife_level BETWEEN 0 AND 3),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.company_service_settings ADD COLUMN IF NOT EXISTS service_flags jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.company_development_dossiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,research_id text NOT NULL REFERENCES public.company_research_catalog(id),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),body text NOT NULL CHECK(length(body)<=8000),data jsonb NOT NULL DEFAULT '{}',actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.company_development_codeshares(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposer_company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,partner_company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,share_percent numeric NOT NULL CHECK(share_percent BETWEEN 0 AND 10),status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','rejected','cancelled')),created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),accepted_at timestamptz,CHECK(proposer_company_id<>partner_company_id));
CREATE UNIQUE INDEX IF NOT EXISTS company_development_codeshare_pending_pair_idx ON public.company_development_codeshares(least(proposer_company_id,partner_company_id),greatest(proposer_company_id,partner_company_id)) WHERE status IN ('proposed','active');
CREATE TABLE IF NOT EXISTS public.company_global_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),month date NOT NULL UNIQUE,catalog_id text NOT NULL REFERENCES public.company_event_catalog(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,effects jsonb NOT NULL,selector text NOT NULL,title text NOT NULL,description text NOT NULL,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS public.company_development_inspections(event_id uuid NOT NULL REFERENCES public.company_global_events(id),aircraft_id uuid NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,company_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,required_at timestamptz NOT NULL,started_at timestamptz,completed_at timestamptz,repair_id uuid,PRIMARY KEY(event_id,aircraft_id),CHECK(completed_at IS NULL OR (started_at>=required_at AND completed_at>=started_at)));

CREATE OR REPLACE FUNCTION public.company_development_is_leader(p_actor uuid,p_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') OR EXISTS(SELECT 1 FROM compagnies WHERE id=p_company AND coalesce(pdg_id,pdg_user_id)=p_actor) OR EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=p_company AND pilote_id=p_actor AND role='co_pdg');
$$;
CREATE OR REPLACE FUNCTION public.company_development_is_member(p_actor uuid,p_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT company_development_is_leader(p_actor,p_company) OR EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=p_company AND pilote_id=p_actor);
$$;
CREATE OR REPLACE FUNCTION public.company_development_has_research(p_company uuid,p_research text,p_at timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM company_research_projects WHERE company_id=p_company AND research_id=p_research AND ready_at<=p_at);
$$;
CREATE OR REPLACE FUNCTION public.company_development_has_unlock(p_company uuid,p_key text,p_at timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM company_research_projects p JOIN company_research_catalog r ON r.id=p.research_id WHERE p.company_id=p_company AND r.unlock_key=p_key AND p.ready_at<=p_at);
$$;
-- HMAC-SHA256 using PostgreSQL's built-in sha256, without an extension dependency.
CREATE OR REPLACE FUNCTION public.company_development_sign(p_message text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k bytea; inner_pad bytea:=decode(repeat('36',64),'hex'); outer_pad bytea:=decode(repeat('5c',64),'hex'); i integer;
BEGIN
 SELECT signing_key INTO k FROM company_development_secrets WHERE id;
 FOR i IN 0..length(k)-1 LOOP inner_pad:=set_byte(inner_pad,i,get_byte(k,i)#54); outer_pad:=set_byte(outer_pad,i,get_byte(k,i)#92); END LOOP;
 RETURN encode(sha256(outer_pad||sha256(inner_pad||convert_to(p_message,'UTF8'))),'hex');
END $$;
CREATE OR REPLACE FUNCTION public.company_development_target(p_company uuid,p_type text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF p_type='appareil' THEN SELECT id INTO target FROM compagnie_avions WHERE compagnie_id=p_company AND NOT coalesce(detruit,false) ORDER BY gen_random_uuid() LIMIT 1;
 ELSIF p_type IN ('batiment','site','base','hub') THEN SELECT id INTO target FROM compagnie_hubs WHERE compagnie_id=p_company ORDER BY gen_random_uuid() LIMIT 1;
 ELSIF p_type='liaison' THEN SELECT id INTO target FROM tarifs_liaisons WHERE compagnie_id=p_company ORDER BY gen_random_uuid() LIMIT 1;
 ELSIF p_type='contrat' THEN SELECT id INTO target FROM company_development_codeshares WHERE status='active' AND p_company IN (proposer_company_id,partner_company_id) ORDER BY gen_random_uuid() LIMIT 1;
 ELSIF p_type IN ('flotte_ciblee','offre_cargo') THEN IF EXISTS(SELECT 1 FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.compagnie_id=p_company AND NOT coalesce(a.detruit,false) AND (p_type<>'offre_cargo' OR t.capacite_cargo_kg>0)) THEN target:=p_company; END IF;
 ELSE target:=p_company;
 END IF;
 RETURN target;
END $$;
CREATE OR REPLACE FUNCTION public.company_development_target_valid(p_company uuid,p_type text,p_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_type='appareil' THEN EXISTS(SELECT 1 FROM compagnie_avions WHERE id=p_target AND compagnie_id=p_company AND NOT coalesce(detruit,false))
 WHEN p_type IN ('batiment','site','base','hub') THEN EXISTS(SELECT 1 FROM compagnie_hubs WHERE id=p_target AND compagnie_id=p_company)
 WHEN p_type='liaison' THEN EXISTS(SELECT 1 FROM tarifs_liaisons WHERE id=p_target AND compagnie_id=p_company)
 WHEN p_type='contrat' THEN EXISTS(SELECT 1 FROM company_development_codeshares WHERE id=p_target AND status='active' AND p_company IN(proposer_company_id,partner_company_id))
 WHEN p_type IN ('flotte_ciblee','offre_cargo') THEN p_target=p_company AND EXISTS(SELECT 1 FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.compagnie_id=p_company AND NOT coalesce(a.detruit,false) AND (p_type<>'offre_cargo' OR t.capacite_cargo_kg>0))
 ELSE p_target=p_company END;
$$;
CREATE OR REPLACE FUNCTION public.company_development_target_label(p_company uuid,p_type text,p_target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_type='appareil' THEN coalesce((SELECT immatriculation FROM compagnie_avions WHERE id=p_target AND compagnie_id=p_company),'Appareil indisponible')
 WHEN p_type IN ('batiment','site','base','hub') THEN coalesce((SELECT 'Site compagnie · '||aeroport_code FROM compagnie_hubs WHERE id=p_target AND compagnie_id=p_company),'Site indisponible')
 WHEN p_type='liaison' THEN coalesce((SELECT aeroport_depart||' → '||aeroport_arrivee FROM tarifs_liaisons WHERE id=p_target AND compagnie_id=p_company),'Liaison indisponible')
 WHEN p_type='contrat' THEN 'Contrat de partenariat'
 ELSE coalesce((SELECT nom FROM compagnies WHERE id=p_company),'Compagnie') END;
$$;
CREATE OR REPLACE FUNCTION public.company_development_selector_matches_context(p_selector text,p_company uuid,p_aircraft uuid,p_departure text DEFAULT NULL,p_arrival text DEFAULT NULL,p_activity text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a compagnie_avions%ROWTYPE; t types_avion%ROWTYPE; s company_service_settings%ROWTYPE;
BEGIN
 IF p_selector IN ('toutes','flotte:tous') THEN RETURN true; END IF;
 IF p_aircraft IS NOT NULL THEN SELECT * INTO a FROM compagnie_avions WHERE id=p_aircraft AND (compagnie_id=p_company OR EXISTS(SELECT 1 FROM compagnie_locations WHERE avion_id=p_aircraft AND locataire_compagnie_id=p_company AND statut='active' AND start_at<=now() AND end_at>=now())); IF NOT FOUND THEN RETURN false; END IF; SELECT * INTO t FROM types_avion WHERE id=a.type_avion_id; END IF;
 SELECT * INTO s FROM company_service_settings WHERE company_id=p_company;
 IF p_selector LIKE 'constructeur:%' THEN RETURN position(lower(split_part(p_selector,':',2)) IN lower(coalesce(t.constructeur,'')))>0; END IF;
 IF p_selector IN ('passagers','usage:passagers') THEN RETURN CASE WHEN p_activity IS NOT NULL THEN p_activity='passagers' ELSE coalesce(t.capacite_pax,0)>0 END; END IF;
 IF p_selector IN ('cargo','usage:cargo') THEN RETURN CASE WHEN p_activity IS NOT NULL THEN p_activity='cargo' ELSE coalesce(t.est_cargo,false) OR coalesce(t.capacite_pax,0)=0 AND coalesce(t.capacite_cargo_kg,0)>0 END; END IF;
 IF p_selector='mixte' THEN RETURN EXISTS(SELECT 1 FROM compagnie_avions x JOIN types_avion y ON y.id=x.type_avion_id WHERE x.compagnie_id=p_company AND y.capacite_pax>0) AND EXISTS(SELECT 1 FROM compagnie_avions x JOIN types_avion y ON y.id=x.type_avion_id WHERE x.compagnie_id=p_company AND (y.est_cargo OR y.capacite_pax=0 AND y.capacite_cargo_kg>0)); END IF;
 IF p_selector LIKE 'depart:%' THEN RETURN coalesce(p_departure,a.aeroport_actuel)=split_part(p_selector,':',2); END IF;
 IF p_selector LIKE 'arrivee:%' THEN RETURN p_arrival=split_part(p_selector,':',2); END IF;
 IF p_selector='liaisons:hubs' THEN RETURN EXISTS(SELECT 1 FROM compagnie_hubs WHERE compagnie_id=p_company AND aeroport_code=p_departure) AND EXISTS(SELECT 1 FROM compagnie_hubs WHERE compagnie_id=p_company AND aeroport_code=p_arrival); END IF;
 IF p_selector='liaisons:base_secondaire' THEN RETURN EXISTS(SELECT 1 FROM compagnie_hubs WHERE compagnie_id=p_company AND NOT est_hub_principal AND aeroport_code IN(p_departure,p_arrival)); END IF;
 IF p_selector='propulsion:turbopropulseur' THEN RETURN coalesce(t.nom,'') ~* '(ATR|Dash|Saab|King.?Air|Q400|DHC.?8|PC.?12|Caravan)'; END IF;
 IF p_selector='propriete:location' THEN RETURN EXISTS(SELECT 1 FROM compagnie_locations WHERE avion_id=p_aircraft AND locataire_compagnie_id=p_company AND statut='active' AND start_at<=now() AND end_at>=now()); END IF;
 IF p_selector='service:wifi_payant' THEN RETURN coalesce(s.wifi_enabled,false) AND s.wifi_price>0; END IF;
 IF p_selector='service:wifi_gratuit' THEN RETURN coalesce(s.wifi_enabled,false) AND s.wifi_price=0; END IF;
 IF p_selector='service:ife' THEN RETURN coalesce(s.ife_level,0)>0; END IF;
 IF p_selector='service:premium' THEN RETURN coalesce(s.seat_ratio,1)<0.9; END IF;
 IF p_selector='service:economique' THEN RETURN coalesce(s.seat_ratio,1)>=0.9; END IF;
 IF p_selector IN ('service:restauration','service:bagages','service:correspondance') THEN RETURN coalesce((s.service_flags->>split_part(p_selector,':',2))::boolean,false) AND coalesce(t.capacite_pax,0)>0; END IF;
 IF p_selector='service:vente_directe' THEN RETURN EXISTS(SELECT 1 FROM compagnies WHERE id=p_company); END IF;
 IF p_selector='service:partenaire' THEN RETURN EXISTS(SELECT 1 FROM company_development_codeshares WHERE status='active' AND p_company IN(proposer_company_id,partner_company_id)); END IF;
 IF p_selector='classe:regional' THEN RETURN coalesce(t.capacite_pax,0) BETWEEN 1 AND 100; END IF;
 IF p_selector='classe:monocouloir' THEN RETURN coalesce(t.capacite_pax,0) BETWEEN 101 AND 250; END IF;
 IF p_selector='classe:gros_porteur' THEN RETURN coalesce(t.capacite_pax,0)>250; END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.company_development_selector_matches(p_selector text,p_company uuid,p_aircraft uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(company_development_selector_matches_context(p_selector,p_company,p_aircraft,NULL,NULL,NULL),false);
$$;
CREATE OR REPLACE FUNCTION public.company_development_event_eligible(p_selector text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_selector LIKE 'arrivee:%' THEN RETURN EXISTS(SELECT 1 FROM compagnie_avions WHERE NOT coalesce(detruit,false)) AND EXISTS(SELECT 1 FROM aeroports WHERE code_oaci=split_part(p_selector,':',2)); END IF;
 IF p_selector='liaisons:hubs' THEN RETURN EXISTS(SELECT 1 FROM compagnie_hubs h WHERE (SELECT count(*) FROM compagnie_hubs x WHERE x.compagnie_id=h.compagnie_id)>=2 AND EXISTS(SELECT 1 FROM compagnie_avions a WHERE a.compagnie_id=h.compagnie_id AND NOT coalesce(a.detruit,false))); END IF;
 IF p_selector='liaisons:base_secondaire' THEN RETURN EXISTS(SELECT 1 FROM compagnie_hubs h WHERE NOT h.est_hub_principal AND EXISTS(SELECT 1 FROM compagnie_avions a WHERE a.compagnie_id=h.compagnie_id AND NOT coalesce(a.detruit,false))); END IF;
 RETURN EXISTS(SELECT 1 FROM compagnie_avions a WHERE NOT coalesce(a.detruit,false) AND company_development_selector_matches(p_selector,a.compagnie_id,a.id));
END $$;

CREATE OR REPLACE FUNCTION public.company_development_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date; event company_event_catalog%ROWTYPE; published timestamptz; finish timestamptz; draw bigint; current_event company_global_events%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('company-global-event:'||m::text,0));
 IF NOT EXISTS(SELECT 1 FROM company_global_events WHERE month=m) THEN
  -- A release after the scheduling window never publishes a retroactive shock.
  -- The first eligible draw is the next UTC month; there is no October-30 backfill.
  IF extract(day FROM now() AT TIME ZONE 'UTC')>15 THEN RETURN; END IF;
  -- Draw one event for the whole network, never one per company. Flight-context
  -- selectors are evaluated on the individual flight when its quote is frozen.
  SELECT * INTO event FROM company_event_catalog WHERE company_development_event_eligible(selector) ORDER BY gen_random_uuid() LIMIT 1;
  IF FOUND THEN
   draw:=(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint);
   published:=now()+(draw%greatest(1,floor(extract(epoch FROM (((m+15)::timestamp AT TIME ZONE 'UTC')-now())))::bigint))*interval '1 second';
   finish:=least((m+interval '1 month')::timestamp AT TIME ZONE 'UTC',published+event.duration_days*interval '1 day');
   INSERT INTO company_global_events(month,catalog_id,starts_at,ends_at,effects,selector,title,description) VALUES(m,event.id,published,finish,event.effects,event.selector,event.title,event.description) ON CONFLICT(month) DO NOTHING;
  END IF;
 END IF;
 FOR current_event IN SELECT * FROM company_global_events WHERE starts_at<=now() AND ends_at>now() AND coalesce((effects->>'inspection_required')::boolean,false) LOOP
  INSERT INTO company_development_inspections(event_id,aircraft_id,company_id,required_at)
  SELECT current_event.id,a.id,a.compagnie_id,current_event.starts_at FROM compagnie_avions a WHERE NOT coalesce(a.detruit,false) AND company_development_selector_matches(current_event.selector,a.compagnie_id,a.id) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.company_development_complete_inspection(p_aircraft uuid,p_repair uuid,p_started_at timestamptz,p_completed_at timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
 IF p_started_at IS NULL OR p_completed_at IS NULL OR p_completed_at<p_started_at OR p_completed_at>now() THEN RAISE EXCEPTION 'Preuve de maintenance invalide'; END IF;
 IF p_repair IS NULL AND NOT EXISTS(SELECT 1 FROM compagnie_avions a WHERE a.id=p_aircraft AND (to_jsonb(a)->>'development_maintenance_started_at')::timestamptz=p_started_at AND a.maintenance_fin_at IS NOT NULL AND a.maintenance_fin_at<=p_completed_at AND a.maintenance_fin_at>=p_started_at) THEN RAISE EXCEPTION 'Cycle de maintenance vérifié requis'; END IF;
 UPDATE company_development_inspections SET started_at=p_started_at,completed_at=p_completed_at,repair_id=p_repair WHERE aircraft_id=p_aircraft AND completed_at IS NULL AND required_at<=p_started_at;
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION public.company_development_sync(p_company uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date; created integer; remaining integer; c company_rse_catalog%ROWTYPE; target uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN; END IF;
 PERFORM company_development_tick();
 PERFORM 1 FROM compagnies WHERE id=p_company FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Compagnie introuvable'; END IF;
 INSERT INTO company_service_settings(company_id) VALUES(p_company) ON CONFLICT DO NOTHING;
 INSERT INTO company_development_cycles(company_id,month) VALUES(p_company,m) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS created=ROW_COUNT;
 IF created=0 THEN RETURN; END IF;
 SELECT greatest(0,5-count(*))::integer INTO remaining FROM company_rse_hands WHERE company_id=p_company AND status='offered';
 FOR c IN SELECT * FROM company_rse_catalog r WHERE (research_id IS NULL OR company_development_has_research(p_company,research_id))
  AND NOT EXISTS(SELECT 1 FROM company_rse_hands h WHERE h.company_id=p_company AND h.catalog_id=r.id AND h.status='offered') ORDER BY gen_random_uuid() LOOP
  EXIT WHEN remaining<=0;
  target:=company_development_target(p_company,c.target_type);
  IF target IS NULL OR EXISTS(SELECT 1 FROM company_rse_commitments x WHERE x.company_id=p_company AND x.catalog_id=c.id AND x.target_id=target AND x.target_type=c.target_type) THEN CONTINUE; END IF;
  IF c.activity='cargo' AND NOT EXISTS(SELECT 1 FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.compagnie_id=p_company AND t.capacite_cargo_kg>0) THEN CONTINUE; END IF;
  IF c.activity='passagers' AND NOT EXISTS(SELECT 1 FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.compagnie_id=p_company AND t.capacite_pax>0) THEN CONTINUE; END IF;
  INSERT INTO company_rse_hands(company_id,catalog_id,target_type,target_id,offer_month) VALUES(p_company,c.id,c.target_type,target,m);
  remaining:=remaining-1;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.company_development_action(p_actor uuid,p_company uuid,p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r company_research_catalog%ROWTYPE; hand company_rse_hands%ROWTYPE; card company_rse_catalog%ROWTYPE; bank felitz_comptes%ROWTYPE;
 prior company_development_operations%ROWTYPE; contract company_development_codeshares%ROWTYPE; cycle company_development_cycles%ROWTYPE;
 operation_token uuid; resource text; result jsonb; new_id uuid; m date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date;
 outcome numeric; entropy bigint; activated timestamptz; sig text; partner uuid; settings jsonb; wifi boolean; price numeric; seats numeric; ife integer; share numeric; flags jsonb; service_key text;
BEGIN
 IF NOT company_development_is_leader(p_actor,p_company) THEN RAISE EXCEPTION 'Opération réservée au PDG ou au co-PDG' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'Le développement des compagnies n’est pas encore activé'; END IF;
 -- Partnership changes are uncommon. A single narrow advisory lock avoids a
 -- cap race between different partners without reversing company-row lock order.
 IF p_action LIKE 'codeshare\_%' ESCAPE '\' THEN PERFORM pg_advisory_xact_lock(hashtextextended('company-development-codeshares',0)); END IF;
 PERFORM company_development_sync(p_company);
 PERFORM 1 FROM compagnies WHERE id=p_company FOR UPDATE;
 IF NOT company_development_is_leader(p_actor,p_company) THEN RAISE EXCEPTION 'La direction de cette compagnie a changé' USING ERRCODE='42501'; END IF;
 IF p_action IN ('research_start','card_commit') THEN
  operation_token:=(p_input->>'idempotency_key')::uuid; IF operation_token IS NULL THEN RAISE EXCEPTION 'Clé de confirmation requise'; END IF;
  resource:=coalesce(p_input->>'research_id',p_input->>'card_id','');
  SELECT * INTO prior FROM company_development_operations WHERE company_id=p_company AND company_development_operations.token=operation_token;
  IF FOUND THEN IF prior.action<>p_action OR prior.resource<>resource THEN RAISE EXCEPTION 'Cette confirmation concerne une autre opération'; END IF; RETURN prior.result; END IF;
 END IF;
 IF p_action='research_start' THEN
  SELECT * INTO r FROM company_research_catalog WHERE id=p_input->>'research_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recherche indisponible'; END IF;
  IF EXISTS(SELECT 1 FROM company_research_projects WHERE company_id=p_company AND research_id=r.id) THEN RAISE EXCEPTION 'Cette recherche est déjà engagée'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(r.prerequisites) req WHERE NOT company_development_has_research(p_company,req)) THEN RAISE EXCEPTION 'Terminez les recherches préalables avant de lancer ce projet'; END IF;
  SELECT * INTO bank FROM felitz_comptes WHERE compagnie_id=p_company AND type='entreprise' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR bank.solde<r.cost THEN RAISE EXCEPTION 'Solde compagnie insuffisant'; END IF;
  UPDATE felitz_comptes SET solde=solde-r.cost WHERE id=bank.id;
  INSERT INTO company_research_projects(company_id,research_id,cost,ready_at,actor_id) VALUES(p_company,r.id,r.cost,now()+r.delay_seconds*interval '1 second',p_actor) RETURNING id INTO new_id;
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle,reference_id) VALUES(bank.id,'debit',r.cost,'Recherche : '||r.title,new_id);
  result:=jsonb_build_object('ok',true,'id',new_id,'ready_at',now()+r.delay_seconds*interval '1 second');
 ELSIF p_action='card_commit' THEN
  SELECT * INTO hand FROM company_rse_hands WHERE id=(p_input->>'card_id')::uuid AND company_id=p_company FOR UPDATE;
  IF NOT FOUND OR hand.status<>'offered' THEN RAISE EXCEPTION 'Cette carte n’est plus disponible'; END IF;
  SELECT * INTO card FROM company_rse_catalog WHERE id=hand.catalog_id;
  IF hand.target_type='appareil' THEN PERFORM 1 FROM compagnie_avions WHERE id=hand.target_id FOR SHARE;
  ELSIF hand.target_type IN ('batiment','site','base','hub') THEN PERFORM 1 FROM compagnie_hubs WHERE id=hand.target_id FOR SHARE;
  ELSIF hand.target_type='liaison' THEN PERFORM 1 FROM tarifs_liaisons WHERE id=hand.target_id FOR SHARE; END IF;
  IF card.research_id IS NOT NULL AND NOT company_development_has_research(p_company,card.research_id) THEN RAISE EXCEPTION 'Recherche requise non terminée'; END IF;
  IF NOT company_development_target_valid(p_company,hand.target_type,hand.target_id) THEN RAISE EXCEPTION 'La cible de cette carte n’appartient plus à la compagnie'; END IF;
  SELECT * INTO cycle FROM company_development_cycles WHERE company_id=p_company AND month=m FOR UPDATE;
  IF cycle.used>=5 THEN RAISE EXCEPTION 'Les engagements disponibles pour ce mois sont épuisés'; END IF;
  SELECT * INTO bank FROM felitz_comptes WHERE compagnie_id=p_company AND type='entreprise' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR bank.solde<card.cost THEN RAISE EXCEPTION 'Solde compagnie insuffisant'; END IF;
  -- Outcome does not exist until AFTER debit. All following writes roll back
  -- together if signing, ledger or uniqueness fails.
  UPDATE felitz_comptes SET solde=solde-card.cost WHERE id=bank.id;
  entropy:=(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint);
  outcome:=(1+(entropy/100)%12)::numeric/10 * CASE WHEN entropy%100<70 THEN 1 ELSE -1 END;
  activated:=now()+card.delay_seconds*interval '1 second'; new_id:=gen_random_uuid();
  sig:=company_development_sign(jsonb_build_array(p_company,new_id,card.id,hand.target_id,card.cost,outcome,activated)::text);
  INSERT INTO company_rse_commitments(id,company_id,hand_id,catalog_id,target_type,target_id,cost,revenue_percent,active_at,actor_id,signature)
   VALUES(new_id,p_company,hand.id,card.id,hand.target_type,hand.target_id,card.cost,outcome,activated,p_actor,sig);
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle,reference_id) VALUES(bank.id,'debit',card.cost,'Engagement RSE : '||card.title,new_id);
  UPDATE company_rse_hands SET status='committed' WHERE id=hand.id;
  UPDATE company_development_cycles SET used=used+1 WHERE company_id=p_company AND month=m;
  result:=jsonb_build_object('ok',true,'id',new_id,'revenue_percent',outcome,'active_at',activated,'signature',sig);
 ELSIF p_action='card_discard' THEN
  UPDATE company_rse_hands SET status='discarded' WHERE id=(p_input->>'card_id')::uuid AND company_id=p_company AND status='offered';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cette carte n’est plus disponible'; END IF;
  -- No refill here. Only the first synchronization of a new UTC month fills gaps.
  result:=jsonb_build_object('ok',true);
 ELSIF p_action='settings' THEN
  settings:=coalesce(p_input->'settings',p_input);
  SELECT wifi_enabled,wifi_price,seat_ratio,ife_level INTO wifi,price,seats,ife FROM company_service_settings WHERE company_id=p_company;
  wifi:=coalesce((settings->>'wifi_enabled')::boolean,wifi,false); price:=coalesce((settings->>'wifi_price')::numeric,price,0);
  seats:=coalesce((settings->>'seat_ratio')::numeric,seats,1); ife:=coalesce((settings->>'ife_level')::integer,ife,0);
  SELECT coalesce(settings->'service_flags',service_flags,'{}'::jsonb) INTO flags FROM company_service_settings WHERE company_id=p_company;
  IF jsonb_typeof(flags)<>'object' THEN RAISE EXCEPTION 'Paramètres de services invalides'; END IF;
  FOR service_key IN SELECT jsonb_object_keys(flags) LOOP
   IF service_key NOT IN ('restauration','bagages','correspondance') OR jsonb_typeof(flags->service_key)<>'boolean' THEN RAISE EXCEPTION 'Service inconnu'; END IF;
   IF (flags->>service_key)::boolean AND NOT company_development_has_unlock(p_company,service_key) THEN RAISE EXCEPTION 'Recherche de service requise : %',service_key; END IF;
  END LOOP;
  IF price<0 OR price>100 OR seats<0.7 OR seats>1 OR ife<0 OR ife>3 THEN RAISE EXCEPTION 'Paramètres hors limites'; END IF;
  IF wifi AND (NOT company_development_has_unlock(p_company,'wifi') OR NOT EXISTS(SELECT 1 FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.compagnie_id=p_company AND t.capacite_pax>0 AND NOT coalesce(a.detruit,false))) THEN RAISE EXCEPTION 'Recherchez le Wi-Fi et possédez un appareil passagers compatible'; END IF;
  IF wifi AND price>0 AND NOT company_development_has_unlock(p_company,'wifi_metered') THEN RAISE EXCEPTION 'Recherche de tarification Wi-Fi requise'; END IF;
  IF wifi AND price=0 AND NOT company_development_has_unlock(p_company,'wifi_free') THEN RAISE EXCEPTION 'Recherche du Wi-Fi gratuit requise'; END IF;
  IF seats<>1 AND NOT company_development_has_unlock(p_company,'seats') THEN RAISE EXCEPTION 'Recherche de configuration des sièges requise'; END IF;
  IF ife>0 AND NOT company_development_has_unlock(p_company,'ife') THEN RAISE EXCEPTION 'Recherche IFE requise'; END IF;
  IF ife>1 AND NOT company_development_has_unlock(p_company,'ife_recent') THEN RAISE EXCEPTION 'Recherche des contenus récents requise'; END IF;
  IF ife>2 AND NOT company_development_has_unlock(p_company,'ife_refresh') THEN RAISE EXCEPTION 'Recherche de renouvellement IFE requise'; END IF;
  UPDATE company_service_settings SET wifi_enabled=wifi,wifi_price=price,seat_ratio=seats,ife_level=ife,service_flags=flags,updated_at=now() WHERE company_id=p_company;
  result:=jsonb_build_object('ok',true);
 ELSIF p_action='dossier' THEN
  IF NOT company_development_has_research(p_company,p_input->>'research_id') THEN RAISE EXCEPTION 'Cette fonction nécessite une recherche terminée'; END IF;
  INSERT INTO company_development_dossiers(company_id,research_id,title,body,data,actor_id) VALUES(p_company,p_input->>'research_id',trim(p_input->>'title'),coalesce(p_input->>'body',''),coalesce(p_input->'data','{}'::jsonb),p_actor) RETURNING id INTO new_id;
  result:=jsonb_build_object('ok',true,'id',new_id);
 ELSIF p_action='codeshare_propose' THEN
  partner:=(p_input->>'partner_id')::uuid; share:=coalesce((p_input->>'share_percent')::numeric,0);
  IF NOT company_development_has_unlock(p_company,'codeshare') THEN RAISE EXCEPTION 'Recherche codeshare requise'; END IF;
  IF partner=p_company OR NOT EXISTS(SELECT 1 FROM compagnies WHERE id=partner) OR share<0 OR share>10 THEN RAISE EXCEPTION 'Partenaire ou partage invalide'; END IF;
  INSERT INTO company_development_codeshares(proposer_company_id,partner_company_id,share_percent,created_by) VALUES(p_company,partner,share,p_actor) RETURNING id INTO new_id;
  result:=jsonb_build_object('ok',true,'id',new_id);
 ELSIF p_action IN ('codeshare_accept','codeshare_reject','codeshare_cancel') THEN
  SELECT * INTO contract FROM company_development_codeshares WHERE id=(p_input->>'agreement_id')::uuid FOR UPDATE;
  IF NOT FOUND OR p_company NOT IN(contract.proposer_company_id,contract.partner_company_id) THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
  IF p_action IN ('codeshare_accept','codeshare_reject') AND (p_company<>contract.partner_company_id OR contract.status<>'proposed') THEN RAISE EXCEPTION 'Seul le partenaire peut répondre à cette proposition'; END IF;
  IF p_action='codeshare_accept' THEN
   IF NOT company_development_has_unlock(p_company,'codeshare') THEN RAISE EXCEPTION 'Recherche codeshare requise chez le partenaire'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY[contract.proposer_company_id,contract.partner_company_id]) c WHERE (SELECT coalesce(sum(share_percent),0) FROM company_development_codeshares x WHERE x.status='active' AND c IN(x.proposer_company_id,x.partner_company_id))+contract.share_percent>15) THEN RAISE EXCEPTION 'Le partage cumulé dépasserait la limite autorisée'; END IF;
  END IF;
  UPDATE company_development_codeshares SET status=CASE p_action WHEN 'codeshare_accept' THEN 'active' WHEN 'codeshare_reject' THEN 'rejected' ELSE 'cancelled' END,accepted_by=CASE WHEN p_action='codeshare_accept' THEN p_actor ELSE accepted_by END,accepted_at=CASE WHEN p_action='codeshare_accept' THEN now() ELSE accepted_at END WHERE id=contract.id;
  result:=jsonb_build_object('ok',true);
 ELSE RAISE EXCEPTION 'Action inconnue';
 END IF;
 IF operation_token IS NOT NULL THEN INSERT INTO company_development_operations(company_id,token,action,resource,result) VALUES(p_company,operation_token,p_action,resource,result); END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.company_development_effects_for_flight(p_company uuid,p_aircraft uuid,p_at timestamptz DEFAULT now(),p_departure text DEFAULT NULL,p_arrival text DEFAULT NULL,p_activity text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s company_service_settings%ROWTYPE; e company_global_events%ROWTYPE; revenue numeric:=0; research numeric:=0; fuel numeric:=0; repair numeric:=0; delay numeric:=0; taxes numeric:=0; grounded boolean:=false; inspect boolean:=false; shares jsonb:='[]'; total_share numeric:=0; passenger boolean:=false; freight boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM economy_release_settings WHERE id AND enabled) THEN RETURN jsonb_build_object('revenue_percent',0,'fuel_percent',0,'repair_percent',0,'repair_delay_percent',0,'airport_tax_percent',0,'grounded',false,'inspection_required',false,'seat_ratio',1,'wifi_enabled',false,'wifi_price',0,'ife_level',0,'codeshare_percent',0,'codeshare_partners','[]'::jsonb); END IF;
 SELECT t.capacite_pax>0,t.est_cargo OR (t.capacite_pax=0 AND t.capacite_cargo_kg>0) INTO passenger,freight FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id WHERE a.id=p_aircraft;
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
CREATE OR REPLACE FUNCTION public.company_development_effects(p_company uuid,p_aircraft uuid,p_at timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT company_development_effects_for_flight(p_company,p_aircraft,p_at,NULL,NULL,NULL);
$$;

CREATE OR REPLACE FUNCTION public.company_development_dashboard(p_actor uuid,p_company uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE leader boolean; enabled boolean; projects jsonb:='[]'; hands jsonb:='[]'; commitments jsonb:='[]'; service jsonb; event jsonb; used integer:=0; m date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date;
BEGIN
 IF NOT company_development_is_member(p_actor,p_company) THEN RAISE EXCEPTION 'Accès réservé aux membres de cette compagnie' USING ERRCODE='42501'; END IF;
 leader:=company_development_is_leader(p_actor,p_company);
 SELECT x.enabled INTO enabled FROM economy_release_settings x WHERE id;
 PERFORM company_development_sync(p_company);
 SELECT jsonb_build_object('title',title,'description',description,'starts_at',starts_at,'ends_at',ends_at,'effects',effects||jsonb_build_object('selector',selector)) INTO event FROM company_global_events WHERE starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1;
 SELECT jsonb_build_object('unlocks',coalesce((SELECT jsonb_agg(r.unlock_key) FROM company_research_projects p JOIN company_research_catalog r ON r.id=p.research_id WHERE p.company_id=p_company AND p.ready_at<=now()),'[]'::jsonb),
  'settings',coalesce((SELECT to_jsonb(s)-'company_id'-'updated_at' FROM company_service_settings s WHERE company_id=p_company),jsonb_build_object('wifi_enabled',false,'wifi_price',0,'seat_ratio',1,'ife_level',0)),
  'dossiers',CASE WHEN leader THEN coalesce((SELECT jsonb_agg(to_jsonb(d)-'actor_id'-'company_id' ORDER BY created_at DESC) FROM company_development_dossiers d WHERE company_id=p_company),'[]'::jsonb) ELSE '[]'::jsonb END,
  'codeshares',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'partner_id',p.id,'partner_name',p.nom,'share_percent',c.share_percent,'status',c.status,'proposer_company_id',c.proposer_company_id,'created_at',c.created_at) ORDER BY c.created_at DESC) FROM company_development_codeshares c JOIN compagnies p ON p.id=CASE WHEN c.proposer_company_id=p_company THEN c.partner_company_id ELSE c.proposer_company_id END WHERE p_company IN(c.proposer_company_id,c.partner_company_id)),'[]'::jsonb)) INTO service;
 IF leader THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'domain',r.domain,'description',r.description,'panel',r.panel,'unlock_key',r.unlock_key,'cost',r.cost,'delay_seconds',r.delay_seconds,'prerequisites',r.prerequisites,'status',CASE WHEN p.id IS NOT NULL THEN CASE WHEN p.ready_at<=now() THEN 'completed' ELSE 'running' END ELSE 'available' END,'ready_at',p.ready_at) ORDER BY r.id),'[]'::jsonb) INTO projects FROM company_research_catalog r LEFT JOIN company_research_projects p ON p.research_id=r.id AND p.company_id=p_company WHERE p.id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM unnest(r.prerequisites) req WHERE NOT company_development_has_research(p_company,req));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'catalog_id',c.id,'title',c.title,'description',c.description,'cost',c.cost,'delay_seconds',c.delay_seconds,'research_id',c.research_id,'target_type',h.target_type,'target_id',h.target_id,'target_label',company_development_target_label(p_company,h.target_type,h.target_id),'expires_month',h.offer_month) ORDER BY h.created_at),'[]'::jsonb) INTO hands FROM company_rse_hands h JOIN company_rse_catalog c ON c.id=h.catalog_id WHERE h.company_id=p_company AND h.status='offered';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',c.title,'target_type',x.target_type,'target_id',x.target_id,'target_label',company_development_target_label(p_company,x.target_type,x.target_id),'cost',x.cost,'committed_at',x.committed_at,'active_at',x.active_at,'status',CASE WHEN x.active_at<=now() THEN 'active' ELSE 'installing' END,'revenue_percent',x.revenue_percent,'signature',x.signature) ORDER BY x.committed_at DESC),'[]'::jsonb) INTO commitments FROM company_rse_commitments x JOIN company_rse_catalog c ON c.id=x.catalog_id WHERE x.company_id=p_company;
  SELECT coalesce(c.used,0) INTO used FROM company_development_cycles c WHERE c.company_id=p_company AND c.month=m;
 END IF;
 RETURN jsonb_build_object('enabled',coalesce(enabled,false),'can_manage',leader,'research',projects,'hand',hands,'commitments',commitments,'monthly',jsonb_build_object('month',m,'used',coalesce(used,0),'remaining',5-coalesce(used,0),'next_refill_at',(m+interval '1 month')::timestamp AT TIME ZONE 'UTC'),'global_event',event,'services',service);
END $$;

-- All new tables and functions are private to the trusted application server.
DO $$ DECLARE item record;
BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'company\_%' ESCAPE '\' OR tablename='economy_release_settings') AND tablename IN ('economy_release_settings','company_research_catalog','company_rse_catalog','company_event_catalog','company_development_secrets','company_research_projects','company_development_cycles','company_rse_hands','company_rse_commitments','company_development_operations','company_service_settings','company_development_dossiers','company_development_codeshares','company_global_events','company_development_inspections') LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.tablename);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',item.tablename);
  EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',item.tablename);
 END LOOP;
 FOR item IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'company_development\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',item.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',item.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
