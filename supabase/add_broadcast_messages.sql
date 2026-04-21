-- ============================================================
-- MESSAGES DE DIFFUSION (broadcast)
-- Permet aux admins d'envoyer un message a une audience entiere :
-- pilotes / atc / siavi / ifsa / admins / tout le monde.
-- Chaque destinataire recoit une ligne 'messages' individuelle.
-- ============================================================

-- Etendre la contrainte de type pour inclure 'broadcast'
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check CHECK (type_message IN (
  'normal', 'cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc',
  'recrutement', 'sanction_ifsa', 'amende_ifsa', 'relance_amende',
  'location_avion', 'cheque_siavi_intervention', 'cheque_siavi_taxes',
  'systeme', 'alerte_connexion',
  'broadcast'
));

-- Index pour retrouver rapidement les messages d'une campagne broadcast
-- Les broadcasts partagent un meme broadcast_id dans metadata pour regroupement
CREATE INDEX IF NOT EXISTS idx_messages_broadcast
  ON public.messages ((metadata->>'broadcast_id'))
  WHERE type_message = 'broadcast';

DO $$ BEGIN
  RAISE NOTICE 'Migration messages broadcast appliquee : type_message = "broadcast" autorise.';
END $$;
