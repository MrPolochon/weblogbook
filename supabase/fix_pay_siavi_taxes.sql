-- Migration: Corriger la fonction pay_siavi_taxes
-- Problème: La fonction crédite directement le compte ET crée un chèque
-- Solution: Ne créer que le chèque, l'encaissement créditera le compte

-- Remplacer la fonction pay_siavi_taxes pour qu'elle ne crée QUE le chèque
CREATE OR REPLACE FUNCTION public.pay_siavi_taxes(
  p_afis_user_id UUID,
  p_vol_id UUID,
  p_aeroport TEXT,
  p_montant INT
)
RETURNS VOID AS $$
DECLARE
  v_identifiant TEXT;
  v_compte_id UUID;
  v_numero_vol TEXT;
BEGIN
  -- Récupérer l'identifiant de l'agent
  SELECT identifiant INTO v_identifiant FROM public.profiles WHERE id = p_afis_user_id;
  
  -- Récupérer le numéro de vol
  SELECT numero_vol INTO v_numero_vol FROM public.plans_vol WHERE id = p_vol_id;
  
  -- Vérifier que le compte Felitz existe (pour la validation)
  SELECT id INTO v_compte_id FROM public.felitz_comptes 
  WHERE proprietaire_id = p_afis_user_id AND type = 'personnel';
  
  IF v_compte_id IS NULL OR p_montant <= 0 THEN
    RETURN;
  END IF;
  
  -- NE PAS créditer directement le compte !
  -- Le chèque sera encaissé par l'utilisateur via l'interface
  
  -- Envoyer un message/chèque (non encaissé par défaut)
  INSERT INTO public.messages (
    destinataire_id, titre, contenu, type_message, 
    cheque_montant, cheque_libelle, cheque_numero_vol,
    cheque_destinataire_compte_id, cheque_encaisse
  ) VALUES (
    p_afis_user_id,
    'Chèque taxes aéroportuaires AFIS',
    'En tant qu''agent AFIS de service sur ' || p_aeroport || ', vous percevez les taxes aéroportuaires du vol ' || COALESCE(v_numero_vol, 'N/A') || '.',
    'cheque_siavi_taxes',
    p_montant,
    'Taxes aéroportuaires AFIS - Vol ' || COALESCE(v_numero_vol, 'N/A') || ' - ' || p_aeroport,
    v_numero_vol,
    v_compte_id,
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Message de confirmation
DO $$ BEGIN RAISE NOTICE '✅ Fonction pay_siavi_taxes corrigée - les chèques ne sont plus auto-encaissés'; END $$;
