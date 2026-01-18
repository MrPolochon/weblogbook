-- Ajouter aéroport de départ et d'arrivée (code OACI PTFS) aux vols
-- Exécuter dans l'éditeur SQL Supabase
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS aeroport_depart TEXT,
  ADD COLUMN IF NOT EXISTS aeroport_arrivee TEXT;
