-- Ajouter la colonne bria_conversation pour stocker l'historique de conversation BRIA
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS bria_conversation JSONB DEFAULT NULL;
