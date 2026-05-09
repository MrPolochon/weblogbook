-- ============================================================
-- Mise à 300 000 F$ des comptes personnels Felitz Bank
-- Uniquement les comptes personnels (type = 'personnel').
-- Exclus : compte armée (type = 'militaire'), comptes entreprise (type = 'entreprise'), alliances (type = 'alliance').
-- À exécuter dans l'éditeur SQL Supabase (service role).
-- ============================================================

UPDATE public.felitz_comptes
SET solde = 300000
WHERE type = 'personnel';

-- Vérification (optionnel) : nombre de comptes mis à jour et total
-- SELECT type, count(*) AS nb_comptes, sum(solde) AS total_solde
-- FROM public.felitz_comptes
-- GROUP BY type
-- ORDER BY type;
