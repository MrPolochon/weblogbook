-- Migration: Corriger la fonction pay_siavi_intervention
-- Problème: La fonction crédite directement le compte ET crée un chèque encaissable = double paiement
-- Solution: Ne créer que le chèque, l'encaissement créditera le compte (même fix que pay_siavi_taxes)

CREATE OR REPLACE FUNCTION public.pay_siavi_intervention(
  p_user_id UUID,
  p_call_id UUID,
  p_aeroport TEXT
)
RETURNS VOID AS $$
DECLARE
  v_identifiant TEXT;
  v_compte_id UUID;
BEGIN
  SELECT identifiant INTO v_identifiant FROM public.profiles WHERE id = p_user_id;
  
  SELECT id INTO v_compte_id FROM public.felitz_comptes 
  WHERE proprietaire_id = p_user_id AND type = 'personnel';
  
  IF v_compte_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Enregistrer l'intervention
  INSERT INTO public.siavi_interventions (user_id, call_id, aeroport, montant)
  VALUES (p_user_id, p_call_id, p_aeroport, 15000);
  
  -- NE PAS créditer directement le compte !
  -- Le chèque sera encaissé par l'utilisateur via l'interface
  
  -- Envoyer un message/chèque (non encaissé par défaut)
  INSERT INTO public.messages (
    destinataire_id, titre, contenu, type_message, 
    cheque_montant, cheque_libelle,
    cheque_destinataire_compte_id, cheque_encaisse
  ) VALUES (
    p_user_id,
    'Prime d''intervention urgence',
    'Félicitations ! Vous avez répondu à un appel d''urgence (911/112) sur ' || p_aeroport || '. Votre prime de 15 000 F$ est disponible en chèque.',
    'cheque_siavi_intervention',
    15000,
    'Prime intervention urgence SIAVI - ' || p_aeroport,
    v_compte_id,
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN RAISE NOTICE 'Fonction pay_siavi_intervention corrigée - les chèques ne sont plus auto-encaissés'; END $$;
