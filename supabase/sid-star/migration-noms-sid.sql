-- ============================================================
-- MIGRATION — Supprimer les anciennes SID avant de réinsérer
-- ============================================================
-- À exécuter AVANT seed-all.sql si vous aviez déjà des SID
-- avec les anciens noms (LOGAN4, TOKYO1, SBH1, ou avec DEPARTURE/RNAV DEPARTURE)
--
-- Étapes :
-- 1. Exécuter ce fichier (supprime les anciennes entrées)
-- 2. Exécuter seed-all.sql (insère les nouvelles avec noms courts)
-- ============================================================

-- Supprimer toutes les SID IRFD, ITKO, IBTH
DELETE FROM public.sid_star
WHERE aeroport IN ('IRFD', 'ITKO', 'IBTH')
  AND type_procedure = 'SID';

-- Puis exécuter : supabase/sid-star/seed-all.sql
