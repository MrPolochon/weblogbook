-- ============================================================
-- ADMIN — Reset historique Felitz + compensation 5 000 F$/compte
-- Exécuté en production le 2026-07-29 (projet iajcynzzybkomaouxwji)
-- ============================================================
-- 1. Efface felitz_virements + felitz_transactions (historique)
-- 2. Conserve felitz_comptes.solde inchangé pendant le wipe
-- 3. Crédite chaque compte de 5 000 F$ avec trace transaction
--
-- Libellé exact : compensation bot HS reset historique requis
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS _felitz_soldes_avant;
CREATE TEMP TABLE _felitz_soldes_avant AS
SELECT id, solde, vban, type FROM public.felitz_comptes;

DELETE FROM public.felitz_virements;
DELETE FROM public.felitz_transactions;

DO $$
DECLARE
  v_mismatch INT;
BEGIN
  SELECT COUNT(*) INTO v_mismatch
  FROM public.felitz_comptes c
  INNER JOIN _felitz_soldes_avant s ON s.id = c.id
  WHERE c.solde IS DISTINCT FROM s.solde;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'ERREUR: % compte(s) avec solde modifié après wipe historique', v_mismatch;
  END IF;
END $$;

UPDATE public.felitz_comptes
SET solde = solde + 5000;

INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
SELECT id, 'credit', 5000, 'compensation bot HS reset historique requis'
FROM public.felitz_comptes;

COMMIT;

-- Vérifications post-op (à exécuter séparément) :
-- SELECT COUNT(*) FROM felitz_comptes;
-- SELECT COUNT(*) FROM felitz_transactions;
-- SELECT COUNT(*) FROM felitz_virements;
-- SELECT SUM(solde) FROM felitz_comptes;
