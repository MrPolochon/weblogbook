-- Correction du refus des avions personnels dont instruction_lifecycle vaut brouillon par défaut.
-- Réinstalle uniquement la fonction de revente, sans modifier les avions ni les soldes.
BEGIN;
CREATE OR REPLACE FUNCTION public.revendre_avion_atomic(p_actor UUID,p_inventaire UUID DEFAULT NULL,p_flotte UUID DEFAULT NULL,p_demande UUID DEFAULT NULL,p_commentaire TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seller UUID:=p_actor; inv UUID:=p_inventaire; fleet UUID:=p_flotte; request_row hangar_market_reventes%ROWTYPE; aircraft RECORD; aircraft_type RECORD; company_id UUID; account_id UUID; amount BIGINT; initial_price BIGINT; rate INTEGER:=50; weekly_count INTEGER:=0; sale_id UUID;
BEGIN
  IF p_demande IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE='42501'; END IF;
    SELECT * INTO request_row FROM hangar_market_reventes WHERE id=p_demande FOR UPDATE;
    IF NOT FOUND OR request_row.statut<>'en_attente' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
    seller:=request_row.demandeur_id; inv:=request_row.inventaire_avion_id; fleet:=request_row.compagnie_avion_id; rate:=request_row.pourcentage_demande;
  END IF;
  IF seller IS NULL OR (inv IS NULL)=(fleet IS NULL) OR rate NOT BETWEEN 50 AND 100 THEN RAISE EXCEPTION 'Sélectionnez un seul avion disponible'; END IF;
  -- Sérialiser la limite hebdomadaire, même pour deux appareils distincts.
  PERFORM pg_advisory_xact_lock(hashtextextended('resale:'||seller::text,0));
  IF p_demande IS NULL THEN
    SELECT count(*) INTO weekly_count FROM hangar_market_reventes WHERE demandeur_id=seller AND statut='executee' AND admin_id IS NULL AND created_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF weekly_count>=2 THEN RAISE EXCEPTION 'Limite de 2 reventes rapides par semaine atteinte'; END IF;
  END IF;
  IF inv IS NOT NULL THEN
    SELECT id,type_avion_id,prix_achat,proprietaire_id,instruction_actif,instruction_session_id,instruction_lifecycle INTO aircraft FROM inventaire_avions WHERE id=inv FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Avion introuvable ou déjà revendu'; END IF;
    -- Le lifecycle vaut aussi 'brouillon' par défaut pour les avions personnels.
    -- Seuls le marquage instruction et le rattachement à une session les distinguent.
    IF aircraft.instruction_actif IS TRUE OR aircraft.instruction_session_id IS NOT NULL THEN RAISE EXCEPTION 'Les avions fictifs d’instruction ne peuvent pas être revendus'; END IF;
    IF aircraft.proprietaire_id IS DISTINCT FROM seller THEN RAISE EXCEPTION 'Cet avion ne vous appartient pas' USING ERRCODE='42501'; END IF;
    SELECT id INTO account_id FROM felitz_comptes WHERE proprietaire_id=seller AND type='personnel';
  ELSE
    SELECT id,type_avion_id,prix_achat,compagnie_id,statut,detruit INTO aircraft FROM compagnie_avions WHERE id=fleet FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Avion introuvable ou déjà revendu'; END IF;
    company_id:=aircraft.compagnie_id;
    IF NOT EXISTS(SELECT 1 FROM compagnies WHERE id=company_id AND pdg_id=seller) THEN RAISE EXCEPTION 'Seul le PDG peut vendre un avion de la flotte' USING ERRCODE='42501'; END IF;
    IF aircraft.detruit OR aircraft.statut='in_flight' THEN RAISE EXCEPTION 'Cet avion est détruit ou en vol'; END IF;
    SELECT id INTO account_id FROM felitz_comptes WHERE compagnie_id=company_id AND type='entreprise';
  END IF;
  IF EXISTS(SELECT 1 FROM hangar_market WHERE statut='en_vente' AND ((inv IS NOT NULL AND inventaire_avion_id=inv) OR (fleet IS NOT NULL AND compagnie_avion_id=fleet))) THEN RAISE EXCEPTION 'Retirez l’annonce de vente avant de revendre cet avion'; END IF;
  IF EXISTS(SELECT 1 FROM plans_vol WHERE statut IN ('depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture') AND ((inv IS NOT NULL AND inventaire_avion_id=inv) OR (fleet IS NOT NULL AND compagnie_avion_id=fleet))) THEN RAISE EXCEPTION 'Impossible de revendre un avion utilisé par un plan actif'; END IF;
  SELECT id,nom,prix INTO aircraft_type FROM types_avion WHERE id=aircraft.type_avion_id;
  IF NOT FOUND OR aircraft_type.prix IS NULL OR aircraft_type.prix<=0 THEN RAISE EXCEPTION 'Prix catalogue introuvable'; END IF;
  initial_price:=least(aircraft_type.prix,CASE WHEN aircraft.prix_achat>0 THEN aircraft.prix_achat ELSE aircraft_type.prix END);
  amount:=round(initial_price::numeric*rate/100);
  UPDATE felitz_comptes SET solde=solde+amount WHERE id=account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte Felitz introuvable'; END IF;
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account_id,'credit',amount,'Revente avion '||aircraft_type.nom||' ('||rate||'% du prix initial)');
  IF p_demande IS NULL THEN
    INSERT INTO hangar_market_reventes(demandeur_id,inventaire_avion_id,compagnie_avion_id,compagnie_id,type_avion_id,prix_initial,pourcentage_demande,montant_revente,statut,execute_at)
      VALUES(seller,inv,fleet,company_id,aircraft_type.id,initial_price,rate,amount,'executee',now()) RETURNING id INTO sale_id;
  ELSE
    UPDATE hangar_market_reventes SET statut='executee',admin_id=p_actor,admin_commentaire=p_commentaire,traite_at=now(),execute_at=now(),montant_revente=amount WHERE id=p_demande;
    sale_id:=p_demande;
  END IF;
  IF inv IS NOT NULL THEN DELETE FROM inventaire_avions WHERE id=inv; ELSE DELETE FROM compagnie_avions WHERE id=fleet; END IF;
  RETURN jsonb_build_object('ok',true,'id',sale_id,'montant',amount,'restantes',greatest(0,1-weekly_count),'type_nom',aircraft_type.nom,'demandeur_id',seller,'pourcentage',rate);
END $$;
REVOKE ALL ON FUNCTION public.revendre_avion_atomic(UUID,UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revendre_avion_atomic(UUID,UUID,UUID,UUID,TEXT) TO service_role;
COMMIT;
