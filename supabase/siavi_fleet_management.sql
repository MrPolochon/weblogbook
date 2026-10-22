-- Fleet operations are atomic and restricted to the server after chief authorization.
BEGIN;
CREATE OR REPLACE FUNCTION public.manage_siavi_aircraft(p_actor uuid,p_aircraft uuid,p_action text,p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a siavi_avions%ROWTYPE; account_id uuid; price numeric; cost numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles p LEFT JOIN siavi_grades g ON g.id=p.siavi_grade_id WHERE p.id=p_actor AND (p.role::text='admin' OR ((p.siavi IS TRUE OR p.role::text='siavi') AND g.nom='Chef de brigade SIAVI'))) THEN RAISE EXCEPTION 'Gestion réservée au chef de brigade'; END IF;
 SELECT * INTO a FROM siavi_avions WHERE id=p_aircraft FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appareil introuvable'; END IF;
 IF a.statut='in_flight' OR EXISTS(SELECT 1 FROM plans_vol WHERE siavi_avion_id=a.id AND statut IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture','planifie_suivant','en_pause')) THEN RAISE EXCEPTION 'Appareil engagé dans une mission'; END IF;
 IF p_action='rename' THEN
  IF length(coalesce(p_name,''))>80 THEN RAISE EXCEPTION 'Nom trop long'; END IF;
  UPDATE siavi_avions SET nom_personnalise=nullif(btrim(p_name),'') WHERE id=a.id;
 ELSIF p_action='maintenance' THEN
  IF a.statut<>'ground' THEN RAISE EXCEPTION 'Appareil au sol requis'; END IF;
  UPDATE siavi_avions SET statut='maintenance' WHERE id=a.id;
 ELSIF p_action='release' THEN
  IF a.statut<>'maintenance' OR a.usure_percent<=0 OR a.maintenance_fin_at IS NOT NULL THEN RAISE EXCEPTION 'Appareil indisponible pour remise en service'; END IF;
  UPDATE siavi_avions SET statut='ground' WHERE id=a.id;
 ELSIF p_action='repair' THEN
  IF a.statut NOT IN ('ground','maintenance','bloque') OR a.usure_percent>=100 OR a.maintenance_fin_at IS NOT NULL THEN RAISE EXCEPTION 'Réparation indisponible'; END IF;
  IF NOT EXISTS(SELECT 1 FROM siavi_hubs WHERE aeroport_oaci=a.aeroport_actuel) THEN RAISE EXCEPTION 'Réparation uniquement dans une base MEDEVAC'; END IF;
  SELECT prix INTO price FROM types_avion WHERE id=a.type_avion_id;
  IF coalesce(price,0)<=0 THEN RAISE EXCEPTION 'Tarif de réparation indisponible'; END IF;
  cost:=round(price*0.5);
  SELECT id INTO account_id FROM felitz_comptes WHERE type='siavi' FOR UPDATE;
  UPDATE felitz_comptes SET solde=solde-cost WHERE id=account_id AND solde>=cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solde SIAVI insuffisant'; END IF;
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account_id,'debit',cost,'Réparation MEDEVAC '||a.immatriculation);
  UPDATE siavi_avions SET usure_percent=100,statut='ground',maintenance_fin_at=NULL WHERE id=a.id;
 ELSE RAISE EXCEPTION 'Action inconnue';
 END IF;
 RETURN jsonb_build_object('ok',true,'cout',coalesce(cost,0));
END;
$$;
REVOKE ALL ON FUNCTION public.manage_siavi_aircraft(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_siavi_aircraft(uuid,uuid,text,text) TO service_role;
-- Coordinate mission creation with maintenance, using the same aircraft row lock.
CREATE OR REPLACE FUNCTION public.guard_siavi_mission_aircraft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a siavi_avions%ROWTYPE;
BEGIN
 IF NEW.siavi_avion_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO a FROM siavi_avions WHERE id=NEW.siavi_avion_id FOR UPDATE;
 IF NOT FOUND OR a.statut<>'ground' OR a.usure_percent<=0 THEN RAISE EXCEPTION 'Appareil MEDEVAC indisponible'; END IF;
 IF EXISTS(SELECT 1 FROM plans_vol p WHERE p.siavi_avion_id=a.id AND p.statut IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture','planifie_suivant','en_pause') AND (NEW.medevac_mission_id IS NULL OR p.medevac_mission_id IS DISTINCT FROM NEW.medevac_mission_id OR p.pilote_id IS DISTINCT FROM NEW.pilote_id)) THEN RAISE EXCEPTION 'Appareil déjà engagé dans une autre mission'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_siavi_mission_aircraft() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_siavi_mission_aircraft ON public.plans_vol;
CREATE TRIGGER guard_siavi_mission_aircraft BEFORE INSERT ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.guard_siavi_mission_aircraft();
COMMIT;
