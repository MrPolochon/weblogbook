-- =============================================================================
-- Transactions historiques : dotation du 1er janvier 2025
-- Les soldes ont été ajoutés manuellement mais n'apparaissent pas dans l'historique.
-- Ce script insère les transactions correspondantes.
-- =============================================================================

-- Comptes entreprises : 1 500 000 F$ chacun
INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle, created_at)
SELECT fc.id, 'credit', 1500000, 'Dotation initiale 1er janvier 2025', '2025-01-01 00:00:00+00'
FROM public.felitz_comptes fc
WHERE fc.type = 'entreprise'
  AND NOT EXISTS (
    SELECT 1 FROM public.felitz_transactions t
    WHERE t.compte_id = fc.id
      AND t.libelle = 'Dotation initiale 1er janvier 2025'
      AND t.montant = 1500000
  );

-- Comptes personnels : 300 000 F$ chacun
INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle, created_at)
SELECT fc.id, 'credit', 300000, 'Dotation initiale 1er janvier 2025', '2025-01-01 00:00:00+00'
FROM public.felitz_comptes fc
WHERE fc.type = 'personnel'
  AND NOT EXISTS (
    SELECT 1 FROM public.felitz_transactions t
    WHERE t.compte_id = fc.id
      AND t.libelle = 'Dotation initiale 1er janvier 2025'
      AND t.montant = 300000
  );

-- Vérification (optionnel)
-- SELECT type, count(*) AS nb_transactions_ajoutees
-- FROM public.felitz_transactions t
-- JOIN public.felitz_comptes fc ON fc.id = t.compte_id
-- WHERE t.libelle = 'Dotation initiale 1er janvier 2025'
-- GROUP BY type;
