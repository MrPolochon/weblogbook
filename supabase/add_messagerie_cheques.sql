-- ============================================================
-- MIGRATION: Messagerie avec chèques à encaisser
-- ============================================================

-- Ajouter les colonnes pour la messagerie étendue
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expediteur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type_message TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS cheque_montant INTEGER,
  ADD COLUMN IF NOT EXISTS cheque_encaisse BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cheque_encaisse_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cheque_destinataire_compte_id UUID REFERENCES public.felitz_comptes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cheque_libelle TEXT,
  ADD COLUMN IF NOT EXISTS cheque_numero_vol TEXT,
  ADD COLUMN IF NOT EXISTS cheque_compagnie_nom TEXT,
  ADD COLUMN IF NOT EXISTS cheque_pour_compagnie BOOLEAN DEFAULT false;

-- Contrainte sur le type de message
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check 
  CHECK (type_message IN ('normal', 'cheque_salaire', 'cheque_revenu_compagnie', 'systeme'));

-- Index pour les chèques non encaissés
CREATE INDEX IF NOT EXISTS idx_messages_cheques_non_encaisses 
  ON public.messages(destinataire_id, cheque_encaisse) 
  WHERE type_message IN ('cheque_salaire', 'cheque_revenu_compagnie') AND cheque_encaisse = false;

-- Politique pour permettre l'envoi de messages entre utilisateurs
DROP POLICY IF EXISTS "messages_insert_self" ON public.messages;
CREATE POLICY "messages_insert_self" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (expediteur_id = auth.uid() OR expediteur_id IS NULL);

-- Politique pour voir les messages envoyés
DROP POLICY IF EXISTS "messages_select_sent" ON public.messages;
CREATE POLICY "messages_select_sent" ON public.messages FOR SELECT TO authenticated
  USING (expediteur_id = auth.uid());
