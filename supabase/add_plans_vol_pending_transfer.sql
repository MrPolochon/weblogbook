-- Transfert en attente : la position cible doit accepter sous 1 min, sinon renvoi au précédent
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS pending_transfer_aeroport TEXT,
  ADD COLUMN IF NOT EXISTS pending_transfer_position TEXT,
  ADD COLUMN IF NOT EXISTS pending_transfer_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_plans_vol_pending ON public.plans_vol(pending_transfer_aeroport, pending_transfer_position)
  WHERE pending_transfer_aeroport IS NOT NULL;
