-- Callsign / numéro de vol (optionnel)
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS callsign TEXT;
