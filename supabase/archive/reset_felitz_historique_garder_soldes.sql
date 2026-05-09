-- ============================================================
-- RESET HISTORIQUE FELITZ — conserver les soldes actuels
-- ============================================================
-- Efface tout l'historique des virements et des transactions,
-- sans modifier felitz_comptes.solde.
-- Pour chaque compte dont le solde ≠ 0, insère une seule ligne
-- dans felitz_transactions avec le libellé « reset historique »
-- (crédit si solde positif, débit si solde négatif).
--
-- Comptes à 0 F$ : aucune ligne d'historique (contrainte montant > 0).
--
-- À exécuter dans le SQL Editor Supabase (rôle postgres / service),
-- de préférence après une sauvegarde ou export des tables concernées.
-- ============================================================

BEGIN;

-- 1) Historique des virements entre comptes
DELETE FROM public.felitz_virements;

-- 2) Historique des mouvements Felitz
DELETE FROM public.felitz_transactions;

-- 3) Point de départ unique par compte, aligné sur le solde déjà en base
INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
SELECT
  id,
  CASE WHEN solde > 0 THEN 'credit' ELSE 'debit' END,
  ABS(solde)::integer,
  'reset historique'
FROM public.felitz_comptes
WHERE solde <> 0;

COMMIT;

-- Vérifications optionnelles :
-- SELECT COUNT(*) AS nb_virements FROM public.felitz_virements;
-- SELECT COUNT(*) AS nb_transactions FROM public.felitz_transactions;
-- SELECT type, COUNT(*) FROM public.felitz_comptes GROUP BY type;
