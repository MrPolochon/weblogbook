BEGIN;

-- Targeted gifts/sales can cross alliance boundaries. Open offers remain alliance-only.
CREATE OR REPLACE FUNCTION public.company_aircraft_transfer_leader(p_actor uuid, p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM compagnies WHERE id=p_company AND pdg_id=p_actor)
 OR EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=p_company AND pilote_id=p_actor AND role='co_pdg');
$$;

CREATE OR REPLACE FUNCTION public.check_company_aircraft_transfer_available(p_aircraft uuid, p_source uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a compagnie_avions%ROWTYPE;
BEGIN
 SELECT * INTO a FROM compagnie_avions WHERE id=p_aircraft FOR UPDATE;
 IF NOT FOUND OR a.compagnie_id IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'Cet appareil n’appartient plus à la compagnie expéditrice'; END IF;
 IF a.statut NOT IN ('ground','disponible') OR coalesce(a.detruit,false) OR a.bloque_incident OR a.maintenance_fin_at>now() THEN RAISE EXCEPTION 'Appareil indisponible'; END IF;
 IF EXISTS(SELECT 1 FROM plans_vol WHERE compagnie_avion_id=a.id AND statut NOT IN ('cloture','annule','refuse'))
 OR EXISTS(SELECT 1 FROM compagnie_locations WHERE avion_id=a.id AND statut IN ('pending','active'))
 OR EXISTS(SELECT 1 FROM company_itineraries WHERE aircraft_id=a.id AND status IN ('planned','active','paused','diverted'))
 OR EXISTS(SELECT 1 FROM reparation_demandes WHERE avion_id=a.id AND statut IN ('acceptee','en_transit','en_reparation','mini_jeux','terminee','facturee','payee','retour_transit'))
 OR EXISTS(SELECT 1 FROM vols_ferry WHERE avion_id=a.id AND statut IN ('planned','in_progress')) THEN RAISE EXCEPTION 'Appareil déjà engagé sur un vol, une location ou une réparation'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_company_aircraft_transfer(p_actor uuid, p_alliance uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a compagnie_avions%ROWTYPE; cfg alliance_parametres%ROWTYPE; dest uuid:=(p_input->>'compagnie_dest_id')::uuid;
 kind text:=p_input->>'type_transfert'; price integer; duration integer; transfer_id uuid; internal_dest boolean;
BEGIN
 SELECT * INTO a FROM compagnie_avions WHERE id=(p_input->>'compagnie_avion_id')::uuid FOR UPDATE;
 IF NOT FOUND OR NOT company_aircraft_transfer_leader(p_actor,a.compagnie_id) OR NOT EXISTS(SELECT 1 FROM alliance_membres WHERE alliance_id=p_alliance AND compagnie_id=a.compagnie_id) THEN RAISE EXCEPTION 'Compagnie expéditrice non autorisée'; END IF;
 IF kind IS NULL OR kind NOT IN ('don','vente','pret') THEN RAISE EXCEPTION 'Type invalide'; END IF;
 SELECT * INTO cfg FROM alliance_parametres WHERE alliance_id=p_alliance;
 IF NOT coalesce(CASE kind WHEN 'don' THEN cfg.don_avions_actif WHEN 'vente' THEN cfg.transfert_avions_actif WHEN 'pret' THEN cfg.pret_avions_actif END,false) THEN RAISE EXCEPTION 'Ce type de transfert est désactivé dans l’alliance'; END IF;
 IF dest=a.compagnie_id THEN RAISE EXCEPTION 'Choisissez une autre compagnie'; END IF;
 IF dest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM compagnies WHERE id=dest) THEN RAISE EXCEPTION 'Compagnie destinataire introuvable'; END IF;
 internal_dest:=EXISTS(SELECT 1 FROM alliance_membres WHERE alliance_id=p_alliance AND compagnie_id=dest);
 IF kind='pret' AND (dest IS NULL OR NOT internal_dest) THEN RAISE EXCEPTION 'Pour un prêt extérieur, utilisez la mise en location'; END IF;
 IF kind='vente' THEN
   price:=(p_input->>'prix')::integer;
   IF price IS NULL OR price<=0 THEN RAISE EXCEPTION 'Le prix doit être un entier strictement positif'; END IF;
 END IF;
 IF kind='pret' THEN
   duration:=(p_input->>'duree_jours')::integer;
   IF duration IS NULL OR duration<1 OR duration>365 THEN RAISE EXCEPTION 'Durée de prêt invalide'; END IF;
 END IF;
 PERFORM check_company_aircraft_transfer_available(a.id,a.compagnie_id);
 IF EXISTS(SELECT 1 FROM alliance_transferts_avions WHERE compagnie_avion_id=a.id AND statut='en_attente') THEN RAISE EXCEPTION 'Une proposition est déjà en attente pour cet appareil'; END IF;
 INSERT INTO alliance_transferts_avions(alliance_id,type_transfert,compagnie_avion_id,compagnie_source_id,compagnie_dest_id,prix,duree_jours,created_by)
 VALUES(p_alliance,kind,a.id,a.compagnie_id,dest,price,duration,p_actor) RETURNING id INTO transfer_id;
 IF dest IS NOT NULL THEN
   INSERT INTO messages(destinataire_id,titre,contenu,type_message)
   SELECT pdg_id,'Proposition de transfert d’avion','Une compagnie vous propose un '||kind||' d’appareil. Consultez Ma compagnie > Flotte pour accepter ou refuser.','normal' FROM compagnies WHERE id=dest;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',transfer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_company_aircraft_transfer(p_actor uuid, p_alliance uuid, p_transfer uuid, p_company uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t alliance_transferts_avions%ROWTYPE; dest uuid; buyer uuid; seller uuid;
BEGIN
 SELECT * INTO t FROM alliance_transferts_avions WHERE id=p_transfer AND alliance_id=p_alliance FOR UPDATE;
 IF NOT FOUND OR t.statut<>'en_attente' THEN RAISE EXCEPTION 'Transfert introuvable ou déjà traité'; END IF;
 dest:=coalesce(t.compagnie_dest_id,p_company);
 IF dest IS NULL OR dest=t.compagnie_source_id OR NOT company_aircraft_transfer_leader(p_actor,dest) THEN RAISE EXCEPTION 'Seule la direction de la compagnie destinataire peut répondre'; END IF;
 IF t.compagnie_dest_id IS NULL AND NOT EXISTS(SELECT 1 FROM alliance_membres WHERE alliance_id=t.alliance_id AND compagnie_id=dest) THEN RAISE EXCEPTION 'Cette offre libre est réservée aux membres de l’alliance'; END IF;
 IF p_action='refuser' THEN
   IF t.compagnie_dest_id IS NULL THEN RAISE EXCEPTION 'Une offre libre ne peut pas être refusée au nom de toute l’alliance'; END IF;
   UPDATE alliance_transferts_avions SET statut='refuse',traite_at=now() WHERE id=t.id;
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action IS DISTINCT FROM 'accepter' THEN RAISE EXCEPTION 'Action invalide'; END IF;
 IF t.type_transfert='pret' AND NOT EXISTS(SELECT 1 FROM alliance_membres WHERE alliance_id=t.alliance_id AND compagnie_id=dest) THEN RAISE EXCEPTION 'Le prêt est réservé aux membres de l’alliance'; END IF;
 PERFORM check_company_aircraft_transfer_available(t.compagnie_avion_id,t.compagnie_source_id);
 IF t.type_transfert='vente' THEN
   IF t.prix IS NULL OR t.prix<=0 THEN RAISE EXCEPTION 'Prix de vente invalide'; END IF;
   -- Lock accounts in the same order for opposite-direction purchases.
   PERFORM 1 FROM felitz_comptes WHERE compagnie_id IN (dest,t.compagnie_source_id) AND type='entreprise' ORDER BY id FOR UPDATE;
   SELECT id INTO STRICT buyer FROM felitz_comptes WHERE compagnie_id=dest AND type='entreprise';
   SELECT id INTO STRICT seller FROM felitz_comptes WHERE compagnie_id=t.compagnie_source_id AND type='entreprise';
   UPDATE felitz_comptes SET solde=solde-t.prix WHERE id=buyer AND solde>=t.prix;
   IF NOT FOUND THEN RAISE EXCEPTION 'Fonds insuffisants'; END IF;
   UPDATE felitz_comptes SET solde=solde+t.prix WHERE id=seller;
   INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES
    (buyer,'debit',t.prix,'Achat appareil intercompagnies'),(seller,'credit',t.prix,'Vente appareil intercompagnies');
 END IF;
 UPDATE compagnie_avions SET compagnie_id=dest WHERE id=t.compagnie_avion_id;
 UPDATE alliance_transferts_avions SET statut='complete',compagnie_dest_id=dest,traite_at=now() WHERE id=t.id;
 UPDATE alliance_transferts_avions SET statut='annule',traite_at=now() WHERE compagnie_avion_id=t.compagnie_avion_id AND id<>t.id AND statut='en_attente';
 UPDATE hangar_market SET statut='annulé' WHERE compagnie_avion_id=t.compagnie_avion_id AND statut='en_vente';
 RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.company_aircraft_transfer_leader(uuid,uuid),public.check_company_aircraft_transfer_available(uuid,uuid),public.propose_company_aircraft_transfer(uuid,uuid,jsonb),public.respond_company_aircraft_transfer(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.propose_company_aircraft_transfer(uuid,uuid,jsonb),public.respond_company_aircraft_transfer(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
