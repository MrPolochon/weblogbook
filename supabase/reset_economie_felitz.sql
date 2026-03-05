-- ============================================================
-- RESET ÉCONOMIE SERVEUR - Felitz Bank
-- Remet tous les soldes à 0 et supprime l'historique des transactions/virements
-- À exécuter dans l'éditeur SQL Supabase (avec prudence !)
-- ============================================================

-- 1. Supprimer l'historique des virements
DELETE FROM public.felitz_virements;

-- 2. Supprimer l'historique des transactions
DELETE FROM public.felitz_transactions;

-- 3. Remettre tous les soldes des comptes Felitz à 0
UPDATE public.felitz_comptes
SET solde = 0;

-- Vérification (optionnel)
-- SELECT type, count(*) as nb_comptes, sum(solde) as total_solde FROM public.felitz_comptes GROUP BY type;
