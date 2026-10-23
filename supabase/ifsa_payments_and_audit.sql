-- Paiement transactionnel et traces indépendantes de la durée de vie des plans.
BEGIN;

CREATE OR REPLACE FUNCTION public.payer_amende_ifsa_atomique(
  p_sanction_id uuid, p_acteur_id uuid, p_compte_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.ifsa_sanctions%ROWTYPE;
  debit public.felitz_comptes%ROWTYPE;
  pdg uuid;
BEGIN
  SELECT * INTO s FROM ifsa_sanctions WHERE id = p_sanction_id FOR UPDATE;
  IF NOT FOUND OR s.type_sanction <> 'amende' THEN RAISE EXCEPTION 'Amende introuvable'; END IF;
  SELECT pdg_id INTO pdg FROM compagnies WHERE id = s.cible_compagnie_id;
  IF NOT (coalesce(s.cible_pilote_id = p_acteur_id, false) OR coalesce(pdg = p_acteur_id, false)) THEN
    RAISE EXCEPTION 'Non autorisé à payer cette amende' USING ERRCODE = '42501';
  END IF;
  IF s.amende_payee THEN RETURN jsonb_build_object('ok', true, 'deja_payee', true); END IF;
  IF NOT s.actif THEN RAISE EXCEPTION 'Amende levée : aucun paiement à effectuer'; END IF;
  IF s.montant_amende IS NULL OR s.montant_amende <= 0 OR s.compte_destination_id IS NULL THEN
    RAISE EXCEPTION 'Montant ou compte destinataire invalide';
  END IF;
  IF p_compte_id IS NOT NULL THEN
    SELECT * INTO debit FROM felitz_comptes WHERE id = p_compte_id;
  ELSIF s.cible_compagnie_id IS NOT NULL THEN
    SELECT * INTO debit FROM felitz_comptes WHERE compagnie_id = s.cible_compagnie_id AND type = 'entreprise' ORDER BY id LIMIT 1;
  ELSE
    SELECT * INTO debit FROM felitz_comptes WHERE proprietaire_id = p_acteur_id AND type = 'personnel' ORDER BY id LIMIT 1;
  END IF;
  IF debit.id IS NULL OR NOT (
    coalesce(debit.proprietaire_id = p_acteur_id AND debit.type = 'personnel', false)
    OR coalesce(debit.compagnie_id = s.cible_compagnie_id AND pdg = p_acteur_id AND debit.type = 'entreprise', false)
  ) THEN RAISE EXCEPTION 'Compte de paiement non autorisé' USING ERRCODE = '42501'; END IF;
  IF debit.id = s.compte_destination_id THEN RAISE EXCEPTION 'Comptes identiques'; END IF;
  -- Ordre stable pour éviter les interblocages entre paiements concurrents.
  PERFORM id FROM felitz_comptes WHERE id IN (debit.id, s.compte_destination_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM felitz_comptes WHERE id = s.compte_destination_id) THEN
    RAISE EXCEPTION 'Compte destinataire introuvable';
  END IF;
  UPDATE felitz_comptes SET solde = solde - s.montant_amende WHERE id = debit.id AND solde >= s.montant_amende;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;
  UPDATE felitz_comptes SET solde = solde + s.montant_amende WHERE id = s.compte_destination_id;
  INSERT INTO felitz_transactions(compte_id, type, montant, libelle, reference_id) VALUES
    (debit.id, 'debit', s.montant_amende, 'Paiement amende IFSA - ' || s.motif, s.id),
    (s.compte_destination_id, 'credit', s.montant_amende, 'Amende IFSA reçue - ' || s.motif, s.id);
  INSERT INTO ifsa_paiements_amendes(sanction_id, montant, paye_par_id, compte_debit_id, compte_credit_id)
    VALUES(s.id, s.montant_amende, p_acteur_id, debit.id, s.compte_destination_id);
  UPDATE ifsa_sanctions SET amende_payee = true, amende_payee_at = now(), amende_payee_par_id = p_acteur_id, actif = false WHERE id = s.id;
  IF s.emis_par_id IS NOT NULL THEN
    INSERT INTO messages(expediteur_id, destinataire_id, titre, contenu, type_message)
    VALUES(p_acteur_id, s.emis_par_id, 'Amende payée - ' || s.motif,
      'L''amende de ' || s.montant_amende || ' F$ a été payée.', 'normal');
  END IF;
  RETURN jsonb_build_object('ok', true, 'deja_payee', false, 'montant', s.montant_amende);
END;
$$;
REVOKE ALL ON FUNCTION public.payer_amende_ifsa_atomique(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payer_amende_ifsa_atomique(uuid, uuid, uuid) TO service_role;

-- Aucune FK vers les messages/plans : l'origine reste après leur suppression.
ALTER TABLE public.felitz_transactions ADD COLUMN IF NOT EXISTS source_message_id uuid;
ALTER TABLE public.felitz_transactions ADD COLUMN IF NOT EXISTS flight_origin jsonb;
CREATE INDEX IF NOT EXISTS felitz_transactions_source_message_idx ON public.felitz_transactions(source_message_id) WHERE source_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.snapshot_cheque_flight_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE origin jsonb;
BEGIN
  IF NEW.metadata->>'plan_vol_id' IS NOT NULL THEN
    SELECT jsonb_build_object(
      'plan_vol_id', p.id, 'numero_vol', p.numero_vol,
      'pilote_id', p.pilote_id, 'copilote_id', p.copilote_id,
      'aeroport_depart', p.aeroport_depart, 'aeroport_arrivee', p.aeroport_arrivee,
      'compagnie_id', p.compagnie_id, 'compagnie_nom', c.nom,
      'accepted_at', p.accepted_at, 'demande_cloture_at', p.demande_cloture_at,
      'temps_prev_min', p.temps_prev_min, 'revenue_brut', p.revenue_brut,
      'salaire_planifie', p.salaire_pilote, 'pourcentage_salaire_compagnie', c.pourcentage_salaire,
      'montant_cheque', NEW.cheque_montant, 'libelle', NEW.cheque_libelle,
      'snapshot_at', now()
    ) INTO origin FROM plans_vol p LEFT JOIN compagnies c ON c.id = p.compagnie_id
    WHERE p.id = (NEW.metadata->>'plan_vol_id')::uuid;
    IF origin IS NOT NULL THEN
      NEW.metadata := NEW.metadata || jsonb_build_object('flight_origin', origin);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_cheque_flight_origin() FROM PUBLIC;
DROP TRIGGER IF EXISTS snapshot_cheque_flight_origin ON public.messages;
CREATE TRIGGER snapshot_cheque_flight_origin BEFORE INSERT ON public.messages
FOR EACH ROW WHEN (NEW.type_message IN ('cheque_salaire', 'cheque_revenu_compagnie'))
EXECUTE FUNCTION public.snapshot_cheque_flight_origin();

ALTER TABLE public.reparation_demandes ADD COLUMN IF NOT EXISTS repare_par_id uuid;
ALTER TABLE public.reparation_demandes ADD COLUMN IF NOT EXISTS repare_par_identifiant text;
COMMENT ON COLUMN public.reparation_demandes.repare_par_identifiant IS 'Identité conservée du réparateur au moment de la fin de réparation';

-- Uniquement les deux réparations explicitement attribuées par leur auteur.
UPDATE public.reparation_demandes SET repare_par_id = p.id, repare_par_identifiant = p.identifiant
FROM public.profiles p
WHERE lower(p.identifiant) = 'mrpolochon'
AND reparation_demandes.id IN ('fa7bdd88-9a18-41c3-a142-b6b475c769cb', '877bc7ee-4b2a-46e4-acb7-b0da2e8806a2')
AND reparation_demandes.statut = 'completee' AND reparation_demandes.repare_par_id IS NULL;
COMMIT;
