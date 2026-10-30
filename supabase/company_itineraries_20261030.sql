-- Commercial connections: planned legs never reserve demand or create revenue.
-- Install after flight_submission_integrity and flight_economy_20261030.
BEGIN;
CREATE TABLE IF NOT EXISTS public.company_itineraries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.compagnies(id) ON DELETE SET NULL,
 pilot_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, aircraft_id uuid REFERENCES public.compagnie_avions(id) ON DELETE SET NULL,
 request_id uuid NOT NULL, request_payload jsonb NOT NULL, flight_number text NOT NULL CHECK(length(flight_number) BETWEEN 1 AND 24),
 nature_transport text NOT NULL CHECK(nature_transport IN ('passagers','cargo')),
 origin text NOT NULL REFERENCES public.aeroports(code_oaci), destination text NOT NULL REFERENCES public.aeroports(code_oaci),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','paused','completed','cancelled','diverted')),
 next_leg_index integer NOT NULL DEFAULT 1 CHECK(next_leg_index BETWEEN 1 AND 6),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 identity_snapshot jsonb NOT NULL DEFAULT '{}', archived_at timestamptz,
 UNIQUE(pilot_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS company_itineraries_reserved_aircraft_idx ON public.company_itineraries(aircraft_id) WHERE status IN ('planned','active','paused','diverted');
CREATE UNIQUE INDEX IF NOT EXISTS company_itineraries_reserved_pilot_idx ON public.company_itineraries(pilot_id) WHERE status IN ('planned','active','paused','diverted');
CREATE INDEX IF NOT EXISTS company_itineraries_company_idx ON public.company_itineraries(company_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.company_itinerary_legs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), itinerary_id uuid NOT NULL REFERENCES public.company_itineraries(id),
 leg_index integer NOT NULL CHECK(leg_index BETWEEN 1 AND 5),
 origin text NOT NULL REFERENCES public.aeroports(code_oaci), destination text NOT NULL REFERENCES public.aeroports(code_oaci),
 preparation jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
 plan_id uuid UNIQUE REFERENCES public.plans_vol(id) ON DELETE SET NULL, original_plan_id uuid, actual_destination text REFERENCES public.aeroports(code_oaci),
 completed_at timestamptz, UNIQUE(itinerary_id,leg_index), CHECK(origin<>destination)
);
-- Historical UUID snapshots survive disposal/deletion. Live references detach
-- instead of making an unused or cancelled route an eternal deletion blocker.
ALTER TABLE public.company_itineraries ADD COLUMN IF NOT EXISTS identity_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.company_itineraries ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.company_itinerary_legs ADD COLUMN IF NOT EXISTS original_plan_id uuid;
UPDATE public.company_itineraries SET identity_snapshot=jsonb_build_object('company_id',company_id,'pilot_id',pilot_id,'aircraft_id',aircraft_id) WHERE identity_snapshot='{}'::jsonb;
UPDATE public.company_itinerary_legs SET original_plan_id=plan_id WHERE plan_id IS NOT NULL AND original_plan_id IS NULL;
ALTER TABLE public.company_itineraries ALTER COLUMN company_id DROP NOT NULL,ALTER COLUMN pilot_id DROP NOT NULL,ALTER COLUMN aircraft_id DROP NOT NULL;
ALTER TABLE public.company_itineraries DROP CONSTRAINT IF EXISTS company_itineraries_company_id_fkey;
ALTER TABLE public.company_itineraries ADD CONSTRAINT company_itineraries_company_id_fkey FOREIGN KEY(company_id) REFERENCES public.compagnies(id) ON DELETE SET NULL;
ALTER TABLE public.company_itineraries DROP CONSTRAINT IF EXISTS company_itineraries_pilot_id_fkey;
ALTER TABLE public.company_itineraries ADD CONSTRAINT company_itineraries_pilot_id_fkey FOREIGN KEY(pilot_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.company_itineraries DROP CONSTRAINT IF EXISTS company_itineraries_aircraft_id_fkey;
ALTER TABLE public.company_itineraries ADD CONSTRAINT company_itineraries_aircraft_id_fkey FOREIGN KEY(aircraft_id) REFERENCES public.compagnie_avions(id) ON DELETE SET NULL;
ALTER TABLE public.company_itinerary_legs DROP CONSTRAINT IF EXISTS company_itinerary_legs_plan_id_fkey;
ALTER TABLE public.company_itinerary_legs ADD CONSTRAINT company_itinerary_legs_plan_id_fkey FOREIGN KEY(plan_id) REFERENCES public.plans_vol(id) ON DELETE SET NULL;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS company_itinerary_id uuid REFERENCES public.company_itineraries(id);
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS company_itinerary_leg_id uuid UNIQUE REFERENCES public.company_itinerary_legs(id);
ALTER TABLE public.company_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_itinerary_legs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_itineraries,public.company_itinerary_legs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.company_itineraries,public.company_itinerary_legs TO service_role;
CREATE TABLE IF NOT EXISTS public.company_itinerary_account_deletions (
 pilot_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 token uuid NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE public.company_itinerary_account_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_itinerary_account_deletions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.company_itinerary_account_deletions TO service_role;

-- Called before either account cleanup starts. The ordinary actor lock plus a
-- short persistent marker closes the gap between preflight and later requests.
CREATE OR REPLACE FUNCTION public.prepare_company_itinerary_account_deletion(p_user uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||p_user::text,0));
 IF p_token IS NULL THEN RAISE EXCEPTION 'Identifiant de suppression requis'; END IF;
 IF EXISTS(SELECT 1 FROM company_itinerary_account_deletions WHERE pilot_id=p_user AND expires_at>now()) THEN RAISE EXCEPTION 'Suppression de ce compte déjà en cours'; END IF;
 IF EXISTS(SELECT 1 FROM plans_vol WHERE pilote_id=p_user AND company_itinerary_id IS NOT NULL AND statut NOT IN ('annule','refuse')) THEN RAISE EXCEPTION 'Ce compte possède un tronçon actif ou un historique de vol clôturé à conserver. Annulez le vol actif ; un compte avec des vols réglés nécessite une anonymisation, pas une suppression'; END IF;
 INSERT INTO company_itinerary_account_deletions(pilot_id,token,expires_at) VALUES(p_user,p_token,now()+interval '15 minutes')
 ON CONFLICT(pilot_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.company_itinerary_authorize(p_actor uuid,p_company uuid,p_aircraft uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE profile jsonb;
BEGIN
 IF p_actor IS NULL OR p_company IS NULL OR p_aircraft IS NULL THEN RAISE EXCEPTION 'Pilote, compagnie et appareil requis'; END IF;
 IF EXISTS(SELECT 1 FROM company_itinerary_account_deletions WHERE pilot_id=p_actor AND expires_at>now()) THEN RAISE EXCEPTION 'Suppression du compte en cours'; END IF;
 SELECT to_jsonb(p) INTO profile FROM profiles p WHERE id=p_actor;
 IF profile IS NULL OR profile->>'role'='atc' THEN RAISE EXCEPTION 'Compte pilote requis'; END IF;
 IF coalesce((profile->>'sanction_blocage_vol')::boolean,false) AND (profile->>'sanction_blocage_jusqu_au' IS NULL OR (profile->>'sanction_blocage_jusqu_au')::timestamptz>now()) THEN RAISE EXCEPTION 'Pilote interdit de vol'; END IF;
 PERFORM authorize_flight_submission(p_actor,jsonb_build_object('compagnie_id',p_company,'compagnie_avion_id',p_aircraft,'vol_commercial',true,'vol_ferry',false));
 IF NOT company_development_has_unlock(p_company,'correspondance') THEN RAISE EXCEPTION 'Recherche Construction des itinéraires avec correspondance requise et terminée'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_company_itinerary(p_actor uuid,p_company uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE it company_itineraries%ROWTYPE; aircraft compagnie_avions%ROWTYPE; leg jsonb; previous text; dest text; i integer:=0; n integer; aircraft_id uuid:=(p_input->>'compagnie_avion_id')::uuid; token uuid:=(p_input->>'request_id')::uuid;
 occupied text[]:=ARRAY['depose','en_attente','en_attente_copilote','accepte','en_cours','automonitoring','en_attente_cloture','en_pause','planifie_suivant'];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||p_actor::text,0));
 PERFORM company_itinerary_authorize(p_actor,p_company,aircraft_id);
 IF token IS NULL THEN RAISE EXCEPTION 'Identifiant de requête requis'; END IF;
 SELECT * INTO it FROM company_itineraries WHERE pilot_id=p_actor AND request_id=token FOR UPDATE;
 IF FOUND THEN
   IF it.company_id<>p_company OR it.request_payload<>p_input THEN RAISE EXCEPTION 'Identifiant de requête déjà utilisé pour un autre itinéraire'; END IF;
   RETURN jsonb_build_object('ok',true,'id',it.id,'itinerary',to_jsonb(it),'replayed',true);
 END IF;
 IF jsonb_typeof(p_input->'segments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Segments requis'; END IF;
 n:=jsonb_array_length(p_input->'segments');
 IF n NOT BETWEEN 2 AND 5 THEN RAISE EXCEPTION 'Un itinéraire comporte 2 à 5 tronçons'; END IF;
 IF coalesce(length(trim(p_input->>'numero_vol')),0) NOT BETWEEN 1 AND 24 OR coalesce(p_input->>'nature_transport','passagers') NOT IN ('passagers','cargo') THEN RAISE EXCEPTION 'Numéro de vol ou nature du transport invalide'; END IF;
 SELECT * INTO aircraft FROM compagnie_avions WHERE id=aircraft_id FOR UPDATE;
 IF NOT FOUND OR aircraft.statut NOT IN ('ground','disponible') OR coalesce(aircraft.detruit,false) OR coalesce(aircraft.bloque_incident,false) OR coalesce(aircraft.usure_percent,0)<=0 THEN RAISE EXCEPTION 'Appareil indisponible'; END IF;
 IF aircraft.compagnie_id IS DISTINCT FROM p_company AND NOT EXISTS(SELECT 1 FROM compagnie_locations WHERE avion_id=aircraft.id AND locataire_compagnie_id=p_company AND statut='active' AND start_at<=now() AND end_at>=now()) THEN RAISE EXCEPTION 'Cet appareil n’appartient pas à la compagnie'; END IF;
 IF EXISTS(SELECT 1 FROM compagnie_locations WHERE avion_id=aircraft.id AND locataire_compagnie_id<>p_company AND statut='active' AND start_at<=now() AND end_at>=now()) THEN RAISE EXCEPTION 'Cet appareil est loué à une autre compagnie'; END IF;
 IF EXISTS(SELECT 1 FROM plans_vol WHERE (compagnie_avion_id=aircraft.id OR pilote_id=p_actor OR copilote_id=p_actor) AND statut=ANY(occupied)) THEN RAISE EXCEPTION 'Pilote ou appareil déjà engagé sur un vol'; END IF;
 IF EXISTS(SELECT 1 FROM reparation_demandes WHERE avion_id=aircraft.id AND statut IN ('acceptee','en_transit','en_reparation','mini_jeux','terminee','facturee','payee','retour_transit')) OR EXISTS(SELECT 1 FROM vols_ferry WHERE avion_id=aircraft.id AND statut IN ('planned','in_progress')) THEN RAISE EXCEPTION 'Appareil engagé en réparation ou transfert'; END IF;
 previous:=upper(p_input->>'aeroport_depart');
 IF previous IS DISTINCT FROM aircraft.aeroport_actuel THEN RAISE EXCEPTION 'Départ différent de la position réelle de l’appareil'; END IF;
 FOR leg IN SELECT value FROM jsonb_array_elements(p_input->'segments') LOOP
   dest:=upper(leg->>'aeroport_arrivee');
   IF dest IS NULL OR dest=previous OR NOT EXISTS(SELECT 1 FROM aeroports WHERE code_oaci=dest) OR (leg ? 'aeroport_depart' AND upper(leg->>'aeroport_depart') IS DISTINCT FROM previous) THEN RAISE EXCEPTION 'Itinéraire discontinu ou aéroport invalide'; END IF;
   IF coalesce(leg->>'type_vol','IFR') NOT IN ('IFR','VFR') OR coalesce((leg->>'temps_prev_min')::integer,0) NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'Préparation du tronçon invalide'; END IF;
   previous:=dest;
 END LOOP;
 INSERT INTO company_itineraries(company_id,pilot_id,aircraft_id,request_id,request_payload,flight_number,nature_transport,origin,destination,identity_snapshot)
 VALUES(p_company,p_actor,aircraft.id,token,p_input,upper(trim(p_input->>'numero_vol')),coalesce(p_input->>'nature_transport','passagers'),aircraft.aeroport_actuel,previous,
   jsonb_build_object('company_id',p_company,'pilot_id',p_actor,'aircraft_id',aircraft.id,'aircraft_registration',to_jsonb(aircraft)->>'immatriculation',
     'company_name',(SELECT to_jsonb(c)->>'nom' FROM compagnies c WHERE id=p_company),'pilot_name',(SELECT to_jsonb(p)->>'identifiant' FROM profiles p WHERE id=p_actor))) RETURNING * INTO it;
 previous:=it.origin;
 FOR leg IN SELECT value FROM jsonb_array_elements(p_input->'segments') LOOP
   i:=i+1;dest:=upper(leg->>'aeroport_arrivee');
   INSERT INTO company_itinerary_legs(itinerary_id,leg_index,origin,destination,preparation) VALUES(it.id,i,previous,dest,leg);previous:=dest;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'id',it.id,'itinerary',to_jsonb(it));
END $$;

-- Covers every standard insertion too, including direct service inserts, retries
-- of refused plans and other pilots attempting to use a reserved aircraft.
CREATE OR REPLACE FUNCTION public.guard_company_itinerary_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE it company_itineraries%ROWTYPE; leg company_itinerary_legs%ROWTYPE;
 occupied text[]:=ARRAY['depose','en_attente','en_attente_copilote','accepte','en_cours','automonitoring','en_attente_cloture','en_pause','planifie_suivant'];
BEGIN
 IF TG_OP='INSERT' AND NEW.pilote_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||NEW.pilote_id::text,0));
   IF EXISTS(SELECT 1 FROM company_itinerary_account_deletions WHERE pilot_id=NEW.pilote_id AND expires_at>now()) THEN RAISE EXCEPTION 'Suppression du compte en cours'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_itinerary_id IS DISTINCT FROM OLD.company_itinerary_id OR NEW.company_itinerary_leg_id IS DISTINCT FROM OLD.company_itinerary_leg_id) THEN RAISE EXCEPTION 'Liaison au parcours immuable'; END IF;
 IF NEW.compagnie_avion_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.company_itinerary_id IS NULL AND NOT NEW.statut=ANY(occupied) THEN RETURN NEW; END IF;
 -- Serializes reservation creation and standard submissions on the same plane.
 PERFORM 1 FROM compagnie_avions WHERE id=NEW.compagnie_avion_id FOR UPDATE;
 SELECT * INTO it FROM company_itineraries WHERE aircraft_id=NEW.compagnie_avion_id AND status IN ('planned','active','paused','diverted');
 IF NEW.company_itinerary_id IS NULL THEN
   IF it.id IS NOT NULL AND NEW.statut=ANY(occupied) THEN RAISE EXCEPTION 'Appareil réservé à un itinéraire avec correspondance'; END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO it FROM company_itineraries WHERE id=NEW.company_itinerary_id FOR UPDATE;
 SELECT * INTO leg FROM company_itinerary_legs WHERE id=NEW.company_itinerary_leg_id AND itinerary_id=it.id;
 IF it.id IS NULL OR leg.id IS NULL OR it.pilot_id IS DISTINCT FROM NEW.pilote_id OR it.aircraft_id IS DISTINCT FROM NEW.compagnie_avion_id OR it.company_id IS DISTINCT FROM NEW.compagnie_id OR NOT coalesce(NEW.vol_commercial,false) OR coalesce(NEW.vol_ferry,false) OR NEW.nature_transport IS DISTINCT FROM it.nature_transport THEN RAISE EXCEPTION 'Plan incompatible avec l’itinéraire'; END IF;
 IF TG_OP='INSERT' OR (NEW.statut=ANY(occupied) AND NOT OLD.statut=ANY(occupied)) THEN
   IF it.status NOT IN ('planned','paused') OR leg.status<>'planned' OR leg.leg_index<>it.next_leg_index OR leg.plan_id IS NOT NULL OR NEW.aeroport_depart IS DISTINCT FROM leg.origin OR NEW.aeroport_arrivee IS DISTINCT FROM leg.destination THEN RAISE EXCEPTION 'Ce tronçon ne peut pas être activé'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.aeroport_depart IS DISTINCT FROM OLD.aeroport_depart THEN RAISE EXCEPTION 'Départ du tronçon immuable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_company_itinerary_plan ON public.plans_vol;
CREATE TRIGGER guard_company_itinerary_plan BEFORE INSERT OR UPDATE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_company_itinerary_plan();

-- Ferry orders use a separate table. Both reservation creation and every live
-- ferry transition lock the same aircraft before inspecting the other table.
CREATE OR REPLACE FUNCTION public.guard_company_itinerary_ferry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.avion_id IS NOT DISTINCT FROM OLD.avion_id AND NEW.statut IS NOT DISTINCT FROM OLD.statut THEN RETURN NEW; END IF;
 IF NEW.avion_id IS NULL OR NEW.statut NOT IN ('planned','in_progress','completed') THEN RETURN NEW; END IF;
 PERFORM 1 FROM compagnie_avions WHERE id=NEW.avion_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM company_itineraries WHERE aircraft_id=NEW.avion_id AND status IN ('planned','active','paused','diverted')) THEN RAISE EXCEPTION 'Appareil réservé à un itinéraire avec correspondance ; annulez les tronçons restants avant un ferry'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_company_itinerary_ferry ON public.vols_ferry;
CREATE TRIGGER guard_company_itinerary_ferry BEFORE INSERT OR UPDATE ON public.vols_ferry FOR EACH ROW EXECUTE FUNCTION public.guard_company_itinerary_ferry();

CREATE OR REPLACE FUNCTION public.guard_company_itinerary_plan_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.company_itinerary_id IS NOT NULL AND OLD.statut NOT IN ('annule','refuse') THEN RAISE EXCEPTION 'Conservez le plan actif ou clôturé et son historique financier'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_company_itinerary_plan_deletion ON public.plans_vol;
CREATE TRIGGER guard_company_itinerary_plan_deletion BEFORE DELETE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_company_itinerary_plan_deletion();

CREATE OR REPLACE FUNCTION public.submit_company_itinerary_leg(p_actor uuid,p_itinerary uuid,p_leg uuid,p_plan jsonb,p_quote uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE it company_itineraries%ROWTYPE; leg company_itinerary_legs%ROWTYPE; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||p_actor::text,0));
 SELECT * INTO it FROM company_itineraries WHERE id=p_itinerary FOR UPDATE;
 IF NOT FOUND OR it.pilot_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Itinéraire introuvable pour ce pilote'; END IF;
 PERFORM company_itinerary_authorize(p_actor,it.company_id,it.aircraft_id);
 SELECT * INTO leg FROM company_itinerary_legs WHERE id=p_leg AND itinerary_id=it.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tronçon introuvable'; END IF;
 -- Replaying a specific leg returns its existing plan, even after closure.
 IF leg.plan_id IS NOT NULL THEN RETURN jsonb_build_object('id',leg.plan_id,'itinerary_id',it.id,'replayed',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM flight_submission_quotes WHERE id=p_quote AND actor_id=p_actor AND economy_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Cet itinéraire exige un devis économique version 2. Un devis historique déjà tiré reste réservé au vol classique ; réessayez ce trajet demain après minuit UTC'; END IF;
 IF it.status NOT IN ('planned','paused') OR leg.status<>'planned' OR leg.leg_index<>it.next_leg_index THEN RAISE EXCEPTION 'Clôturez le tronçon en cours avant de reprendre'; END IF;
 IF (p_plan->>'pilote_id')::uuid IS DISTINCT FROM p_actor OR (p_plan->>'compagnie_id')::uuid IS DISTINCT FROM it.company_id OR (p_plan->>'compagnie_avion_id')::uuid IS DISTINCT FROM it.aircraft_id OR p_plan->>'aeroport_depart' IS DISTINCT FROM leg.origin OR p_plan->>'aeroport_arrivee' IS DISTINCT FROM leg.destination THEN RAISE EXCEPTION 'Plan incompatible avec le tronçon prévu'; END IF;
 IF EXISTS(SELECT 1 FROM compagnie_avions WHERE id=it.aircraft_id AND aeroport_actuel IS DISTINCT FROM leg.origin) THEN RAISE EXCEPTION 'Replanification requise depuis la position réelle de l’appareil'; END IF;
 result:=submit_flight_plan_integrity(p_actor,p_plan||jsonb_build_object('company_itinerary_id',it.id,'company_itinerary_leg_id',leg.id),p_quote);
 UPDATE company_itinerary_legs SET status='active',plan_id=(result->>'id')::uuid WHERE id=leg.id;
 UPDATE company_itineraries SET status='active',updated_at=now() WHERE id=it.id;
 RETURN result||jsonb_build_object('itinerary_id',it.id,'leg_id',leg.id);
END $$;

-- A settled plan stays closed forever; only the separate itinerary pauses.
CREATE OR REPLACE FUNCTION public.sync_company_itinerary_leg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE it company_itineraries%ROWTYPE; leg company_itinerary_legs%ROWTYPE; has_next boolean;
BEGIN
 IF NEW.company_itinerary_id IS NULL OR NEW.statut IS NOT DISTINCT FROM OLD.statut THEN RETURN NEW; END IF;
 IF NEW.statut NOT IN ('cloture','annule','refuse') THEN RETURN NEW; END IF;
 IF NEW.statut='cloture' AND NOT EXISTS(SELECT 1 FROM flight_economy_settlements WHERE plan_id=NEW.id) THEN RAISE EXCEPTION 'Le règlement atomique du tronçon doit être enregistré avant sa clôture'; END IF;
 SELECT * INTO it FROM company_itineraries WHERE id=NEW.company_itinerary_id FOR UPDATE;
 SELECT * INTO leg FROM company_itinerary_legs WHERE id=NEW.company_itinerary_leg_id FOR UPDATE;
 IF leg.status IN ('completed','cancelled') THEN RETURN NEW; END IF;
 IF NEW.statut='cloture' THEN
   UPDATE company_itinerary_legs SET status='completed',actual_destination=NEW.aeroport_arrivee,completed_at=coalesce(NEW.cloture_at,now()) WHERE id=leg.id;
   SELECT EXISTS(SELECT 1 FROM company_itinerary_legs WHERE itinerary_id=it.id AND leg_index>leg.leg_index AND status='planned') INTO has_next;
   UPDATE company_itineraries SET status=CASE WHEN NEW.aeroport_arrivee IS DISTINCT FROM leg.destination THEN 'diverted' WHEN has_next THEN 'paused' ELSE 'completed' END,
     next_leg_index=leg.leg_index+1,updated_at=now(),completed_at=CASE WHEN NOT has_next AND NEW.aeroport_arrivee=leg.destination THEN now() ELSE NULL END WHERE id=it.id;
 ELSE
   UPDATE company_itinerary_legs SET status='cancelled' WHERE itinerary_id=it.id AND status IN ('planned','active');
   UPDATE company_itineraries SET status='cancelled',updated_at=now() WHERE id=it.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_company_itinerary_leg ON public.plans_vol;
CREATE TRIGGER sync_company_itinerary_leg AFTER UPDATE OF statut ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.sync_company_itinerary_leg();

CREATE OR REPLACE FUNCTION public.cancel_company_itinerary(p_actor uuid,p_itinerary uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE it company_itineraries%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('flight-actor:'||p_actor::text,0));
 SELECT * INTO it FROM company_itineraries WHERE id=p_itinerary FOR UPDATE;
 IF NOT FOUND OR it.pilot_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Itinéraire introuvable pour ce pilote'; END IF;
 -- Cancellation remains available after employment or research access changes.
 IF it.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'id',it.id,'replayed',true); END IF;
 IF it.status='completed' THEN RAISE EXCEPTION 'Cet itinéraire est déjà terminé'; END IF;
 IF EXISTS(SELECT 1 FROM company_itinerary_legs l JOIN plans_vol p ON p.id=l.plan_id WHERE l.itinerary_id=it.id AND l.status='active' AND p.statut NOT IN ('cloture','annule','refuse')) THEN RAISE EXCEPTION 'Clôturez ou annulez le plan actif avant d’annuler les tronçons restants'; END IF;
 UPDATE company_itinerary_legs SET status='cancelled' WHERE itinerary_id=it.id AND status='planned';
 UPDATE company_itineraries SET status='cancelled',updated_at=now() WHERE id=it.id;
 RETURN jsonb_build_object('ok',true,'id',it.id);
END $$;

CREATE OR REPLACE FUNCTION public.guard_company_itinerary_structure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE detached boolean:=false;
BEGIN
 IF TG_TABLE_NAME='company_itinerary_legs' THEN
   IF NEW.itinerary_id IS DISTINCT FROM OLD.itinerary_id OR NEW.leg_index IS DISTINCT FROM OLD.leg_index OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.destination IS DISTINCT FROM OLD.destination OR NEW.preparation IS DISTINCT FROM OLD.preparation OR NEW.original_plan_id IS DISTINCT FROM OLD.original_plan_id THEN RAISE EXCEPTION 'Tronçon prévu immuable ; créez un nouvel itinéraire pour replanifier'; END IF;
   IF OLD.plan_id IS NOT NULL AND NEW.plan_id IS DISTINCT FROM OLD.plan_id AND NOT (NEW.plan_id IS NULL AND NOT EXISTS(SELECT 1 FROM plans_vol WHERE id=OLD.plan_id)) THEN RAISE EXCEPTION 'Lien au plan immuable'; END IF;
   IF OLD.plan_id IS NULL AND NEW.plan_id IS NOT NULL THEN
     IF OLD.original_plan_id IS NOT NULL THEN RAISE EXCEPTION 'Un ancien tronçon ne peut pas recevoir un second plan'; END IF;
     NEW.original_plan_id:=NEW.plan_id;
   END IF;
 ELSE
   IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
     IF NEW.company_id IS NOT NULL OR EXISTS(SELECT 1 FROM compagnies WHERE id=OLD.company_id) THEN RAISE EXCEPTION 'Structure de l’itinéraire immuable'; END IF;
     detached:=true;
   END IF;
   IF NEW.pilot_id IS DISTINCT FROM OLD.pilot_id THEN
     IF NEW.pilot_id IS NOT NULL OR EXISTS(SELECT 1 FROM profiles WHERE id=OLD.pilot_id) THEN RAISE EXCEPTION 'Structure de l’itinéraire immuable'; END IF;
     detached:=true;
   END IF;
   IF NEW.aircraft_id IS DISTINCT FROM OLD.aircraft_id THEN
     IF NEW.aircraft_id IS NOT NULL OR EXISTS(SELECT 1 FROM compagnie_avions WHERE id=OLD.aircraft_id) THEN RAISE EXCEPTION 'Structure de l’itinéraire immuable'; END IF;
     detached:=true;
   END IF;
   IF NEW.origin IS DISTINCT FROM OLD.origin OR NEW.destination IS DISTINCT FROM OLD.destination OR NEW.nature_transport IS DISTINCT FROM OLD.nature_transport OR NEW.request_payload IS DISTINCT FROM OLD.request_payload OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.flight_number IS DISTINCT FROM OLD.flight_number OR NEW.identity_snapshot IS DISTINCT FROM OLD.identity_snapshot THEN RAISE EXCEPTION 'Structure de l’itinéraire immuable'; END IF;
   IF detached THEN
     IF EXISTS(SELECT 1 FROM company_itinerary_legs WHERE itinerary_id=OLD.id AND status='active') THEN RAISE EXCEPTION 'Clôturez ou annulez le plan actif avant de supprimer une entité de cet itinéraire'; END IF;
     NEW.archived_at:=coalesce(OLD.archived_at,now());
     NEW.updated_at:=now();
     IF OLD.status<>'completed' THEN NEW.status:='cancelled'; END IF;
     UPDATE company_itinerary_legs SET status='cancelled' WHERE itinerary_id=OLD.id AND status='planned';
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_company_itinerary_structure ON public.company_itineraries;
CREATE TRIGGER guard_company_itinerary_structure BEFORE UPDATE ON public.company_itineraries FOR EACH ROW EXECUTE FUNCTION public.guard_company_itinerary_structure();
DROP TRIGGER IF EXISTS guard_company_itinerary_leg_structure ON public.company_itinerary_legs;
CREATE TRIGGER guard_company_itinerary_leg_structure BEFORE UPDATE ON public.company_itinerary_legs FOR EACH ROW EXECUTE FUNCTION public.guard_company_itinerary_structure();
REVOKE ALL ON FUNCTION public.company_itinerary_authorize(uuid,uuid,uuid),public.create_company_itinerary(uuid,uuid,jsonb),public.submit_company_itinerary_leg(uuid,uuid,uuid,jsonb,uuid),public.cancel_company_itinerary(uuid,uuid),public.guard_company_itinerary_plan(),public.guard_company_itinerary_ferry(),public.guard_company_itinerary_plan_deletion(),public.prepare_company_itinerary_account_deletion(uuid,uuid),public.sync_company_itinerary_leg(),public.guard_company_itinerary_structure() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_itinerary(uuid,uuid,jsonb),public.submit_company_itinerary_leg(uuid,uuid,uuid,jsonb,uuid),public.cancel_company_itinerary(uuid,uuid),public.prepare_company_itinerary_account_deletion(uuid,uuid) TO service_role;
COMMIT;
