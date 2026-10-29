-- CURRENT economy hardening only. No November research/economy features are enabled.
-- Install before deploying the API. Missing functions deliberately fail closed (HTTP 503).
BEGIN;
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
COMMIT;
