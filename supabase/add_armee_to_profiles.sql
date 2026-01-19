-- Rôle Armée (accès Espace militaire)
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS armee BOOLEAN NOT NULL DEFAULT false;
