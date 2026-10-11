-- Transfert atomique, autorisé exclusivement au PDG connecté.
CREATE OR REPLACE FUNCTION public.transferer_propriete(
  p_type text, p_id uuid, p_destinataire uuid,
  p_confirmation_1 boolean, p_confirmation_2 text, p_confirmation_3 boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pdg uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_confirmation_1 IS DISTINCT FROM true OR p_confirmation_2 IS DISTINCT FROM 'oui'
     OR p_confirmation_3 IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Les trois confirmations sont requises';
  END IF;
  IF p_type = 'compagnie' THEN
    SELECT pdg_id INTO v_pdg FROM compagnies WHERE id = p_id FOR UPDATE;
  ELSIF p_type = 'reparation' THEN
    SELECT pdg_id INTO v_pdg FROM entreprises_reparation WHERE id = p_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Type invalide'; END IF;
  IF v_pdg IS NULL OR v_pdg <> v_actor THEN RAISE EXCEPTION 'Seul le PDG actuel peut transférer la propriété'; END IF;
  IF p_destinataire = v_actor OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_destinataire) THEN
    RAISE EXCEPTION 'Nouveau PDG invalide';
  END IF;
  IF p_type = 'compagnie' THEN
    UPDATE compagnies SET pdg_id = p_destinataire WHERE id = p_id;
    UPDATE compagnie_employes SET role = 'employe'
      WHERE compagnie_id = p_id AND pilote_id IN (v_actor, p_destinataire);
  ELSE
    UPDATE entreprises_reparation SET pdg_id = p_destinataire, updated_at = now() WHERE id = p_id;
    UPDATE reparation_employes SET role = 'technicien' WHERE entreprise_id = p_id AND role = 'pdg';
    INSERT INTO reparation_employes (entreprise_id, user_id, role)
      VALUES (p_id, p_destinataire, 'pdg')
      ON CONFLICT (entreprise_id, user_id) DO UPDATE SET role = 'pdg';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.transferer_propriete(text, uuid, uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transferer_propriete(text, uuid, uuid, boolean, text, boolean) TO authenticated;
