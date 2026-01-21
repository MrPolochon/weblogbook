-- Temps total en service ATC (accumulé à chaque « hors service »)
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc_temps_total_minutes INTEGER NOT NULL DEFAULT 0;
