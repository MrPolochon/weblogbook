BEGIN;
DO $$
DECLARE actor uuid; model uuid; aircraft uuid:=gen_random_uuid(); denied boolean:=false; outcome jsonb; cost numeric; account_id uuid; base text;
BEGIN
 SELECT p.id INTO actor FROM profiles p LEFT JOIN siavi_grades g ON g.id=p.siavi_grade_id WHERE p.role::text='admin' OR ((p.siavi IS TRUE OR p.role::text='siavi') AND g.nom='Chef de brigade SIAVI') LIMIT 1;
 SELECT id,round(prix*0.5) INTO model,cost FROM types_avion WHERE prix>0 ORDER BY prix LIMIT 1;
 SELECT id INTO account_id FROM felitz_comptes WHERE type='siavi';
 SELECT aeroport_oaci INTO base FROM siavi_hubs LIMIT 1;
 IF base IS NULL THEN INSERT INTO siavi_hubs(aeroport_oaci,is_principal) VALUES('IRFD',false); base:='IRFD'; END IF;
 IF actor IS NULL OR model IS NULL THEN RAISE EXCEPTION 'Données de validation manquantes'; END IF;
 INSERT INTO siavi_avions(id,type_avion_id,immatriculation,aeroport_actuel,statut,usure_percent) VALUES(aircraft,model,'QA-'||left(aircraft::text,8),'IRFD','ground',100);
 BEGIN PERFORM manage_siavi_aircraft(gen_random_uuid(),aircraft,'maintenance',NULL); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='Gestion réservée au chef de brigade'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Accès non autorisé accepté'; END IF;
 PERFORM manage_siavi_aircraft(actor,aircraft,'rename','Validation MEDEVAC');
 IF (SELECT nom_personnalise FROM siavi_avions WHERE id=aircraft)<>'Validation MEDEVAC' THEN RAISE EXCEPTION 'Renommage incorrect'; END IF;
 PERFORM manage_siavi_aircraft(actor,aircraft,'maintenance',NULL);
 IF (SELECT statut FROM siavi_avions WHERE id=aircraft)<>'maintenance' THEN RAISE EXCEPTION 'Immobilisation incorrecte'; END IF;
 PERFORM manage_siavi_aircraft(actor,aircraft,'release',NULL);
 IF (SELECT statut FROM siavi_avions WHERE id=aircraft)<>'ground' THEN RAISE EXCEPTION 'Remise en service incorrecte'; END IF;
 denied:=false;
 BEGIN PERFORM manage_siavi_aircraft(actor,aircraft,'repair',NULL); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='Réparation indisponible'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Appareil sain facturé'; END IF;
UPDATE siavi_avions SET usure_percent=50,aeroport_actuel=base WHERE id=aircraft;
 UPDATE felitz_comptes SET solde=cost-1 WHERE id=account_id;
 denied:=false;
 BEGIN PERFORM manage_siavi_aircraft(actor,aircraft,'repair',NULL); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='Solde SIAVI insuffisant'; END;
 IF NOT denied OR (SELECT usure_percent FROM siavi_avions WHERE id=aircraft)<>50 OR (SELECT solde FROM felitz_comptes WHERE id=account_id)<>cost-1 THEN RAISE EXCEPTION 'Réparation sans fonds incorrecte'; END IF;
 UPDATE felitz_comptes SET solde=cost WHERE id=account_id;
 PERFORM manage_siavi_aircraft(actor,aircraft,'repair',NULL);
 IF (SELECT usure_percent FROM siavi_avions WHERE id=aircraft)<>100 OR (SELECT solde FROM felitz_comptes WHERE id=account_id)<>0 THEN RAISE EXCEPTION 'Réparation et débit incorrects'; END IF;
 IF (SELECT count(*) FROM felitz_transactions WHERE compte_id=account_id AND libelle='Réparation MEDEVAC '||(SELECT immatriculation FROM siavi_avions WHERE id=aircraft))<>1 THEN RAISE EXCEPTION 'Trace de paiement incorrecte'; END IF;
END $$;
SELECT NOT has_function_privilege('authenticated','public.manage_siavi_aircraft(uuid,uuid,text,text)','EXECUTE') AS chef_api_uniquement,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_siavi_mission_aircraft' AND NOT tgisinternal) AS protection_mission,
 'Renommage, immobilisation, remise en service, refus sans droits réparation inutile, budget insuffisant et paiement unique : OK. Toutes les données de test sont annulées.' AS validation;
ROLLBACK;
