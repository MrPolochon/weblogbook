-- ============================================================
--  ADMIN — Recalibrer le solde de TOUS les comptes Felitz
-- ============================================================
--
-- Aligne l'historique `felitz_transactions` sur le solde RÉEL de chaque
-- compte `felitz_comptes`. Pour chaque compte ayant un écart entre
-- (somme des crédits - somme des débits) et le solde stocké, on insère
-- UNE seule ligne de recalibrage qui ramène les deux à l'équilibre.
--
-- Le solde lui-même n'est jamais modifié. C'est l'historique qui se met
-- au niveau du solde (le solde reste la "source de vérité").
--
-- ⚠️  Le script est en deux phases. Lance la phase 1 d'abord pour voir
--     les écarts, puis la phase 2 pour appliquer la correction.
--
-- ============================================================

-- ─── PHASE 1 : DIAGNOSTIC SEUL (lecture seule, n'écrit rien) ──────
-- ============================================================
--  Affiche tous les comptes ayant un écart > 0. Lance ça en premier.
-- ============================================================

SELECT
  fc.vban,
  fc.type,
  fc.solde                                                                              AS solde_reel,
  COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)                         AS total_credits,
  COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0)                         AS total_debits,
  COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
    - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0)                     AS somme_transactions,
  fc.solde
    - (
        COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
        - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0)
      )                                                                                  AS ecart
FROM public.felitz_comptes fc
LEFT JOIN public.felitz_transactions ft ON ft.compte_id = fc.id
GROUP BY fc.id, fc.vban, fc.type, fc.solde
HAVING fc.solde
  - (
      COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
      - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0)
    ) <> 0
ORDER BY ABS(
  fc.solde
  - (
      COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
      - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0)
    )
) DESC;


-- ─── PHASE 2 : CORRECTION ──────────────────────────────────────
-- ============================================================
--  Décommenter le bloc ci-dessous (sélectionner depuis "DO $$" jusqu'à
--  "$$ LANGUAGE plpgsql;" et l'exécuter) pour appliquer le recalibrage
--  sur TOUS les comptes en écart.
--
--  Le script :
--    - Itère sur chaque compte
--    - Calcule l'écart = solde_réel - somme_transactions
--    - Si écart != 0 : insère 1 ligne de recalibrage (crédit ou débit)
--      avec le libellé "Recalibrage solde — alignement historique"
--    - Affiche un récap dans les NOTICE
--    - Compte le total : nombre de comptes corrigés + montant total
--
--  ⚠️  À exécuter UNE seule fois. Une 2ème exécution n'aura rien à faire.
-- ============================================================

-- DO $$
-- DECLARE
--   r RECORD;
--   v_ecart        BIGINT;
--   v_nb_corriges  INT := 0;
--   v_nb_skipped   INT := 0;
--   v_total_credit BIGINT := 0;
--   v_total_debit  BIGINT := 0;
-- BEGIN
--   FOR r IN
--     SELECT
--       fc.id,
--       fc.vban,
--       fc.type,
--       fc.solde AS solde_reel,
--       COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
--         - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'), 0) AS somme_tx
--     FROM public.felitz_comptes fc
--     LEFT JOIN public.felitz_transactions ft ON ft.compte_id = fc.id
--     GROUP BY fc.id, fc.vban, fc.type, fc.solde
--   LOOP
--     v_ecart := r.solde_reel - r.somme_tx;
--
--     IF v_ecart = 0 THEN
--       v_nb_skipped := v_nb_skipped + 1;
--       CONTINUE;
--     END IF;
--
--     IF v_ecart > 0 THEN
--       INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
--       VALUES (r.id, 'credit', v_ecart,
--               'Recalibrage solde — alignement historique (admin batch)');
--       v_total_credit := v_total_credit + v_ecart;
--     ELSE
--       INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
--       VALUES (r.id, 'debit', ABS(v_ecart),
--               'Recalibrage solde — alignement historique (admin batch)');
--       v_total_debit := v_total_debit + ABS(v_ecart);
--     END IF;
--
--     v_nb_corriges := v_nb_corriges + 1;
--     RAISE NOTICE '  [%] % — écart % F$ → ligne ajoutée',
--                  r.type, r.vban,
--                  to_char(v_ecart, 'FMSG999G999G999G999');
--   END LOOP;
--
--   RAISE NOTICE '════════════════════════════════════════════';
--   RAISE NOTICE 'RECALIBRAGE TERMINÉ';
--   RAISE NOTICE '  Comptes corrigés : %', v_nb_corriges;
--   RAISE NOTICE '  Comptes OK       : %', v_nb_skipped;
--   RAISE NOTICE '  Total crédits ajoutés : % F$',
--                to_char(v_total_credit, 'FM999G999G999G999');
--   RAISE NOTICE '  Total débits  ajoutés : % F$',
--                to_char(v_total_debit, 'FM999G999G999G999');
--   RAISE NOTICE '════════════════════════════════════════════';
-- END;
-- $$ LANGUAGE plpgsql;


-- ─── VÉRIFICATION POST-CORRECTION ─────────────────────────────
-- ============================================================
--  Cette requête ne doit retourner AUCUNE ligne après la phase 2 :
--  cela signifie que tous les comptes sont alignés.
-- ============================================================

-- SELECT
--   fc.vban,
--   fc.type,
--   fc.solde AS solde_reel,
--   COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
--     - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0) AS somme_tx
-- FROM public.felitz_comptes fc
-- LEFT JOIN public.felitz_transactions ft ON ft.compte_id = fc.id
-- GROUP BY fc.id
-- HAVING fc.solde <> COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
--                 - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'),  0);
