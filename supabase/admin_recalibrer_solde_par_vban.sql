-- ============================================================
--  ADMIN — Recalibrer le solde d'un compte Felitz par VBAN
-- ============================================================
--
-- Usage typique : un compte a un solde "réel" en base qui ne correspond
-- plus à la somme cumulée des lignes `felitz_transactions` (suite à un
-- bug historique, un crash, une opération hors-trace, etc.).
--
-- Ce script :
--   1. Récupère le compte par VBAN.
--   2. Calcule la somme attendue = SUM(crédits) - SUM(débits) sur TOUT
--      l'historique (et pas juste les 100 dernières).
--   3. Compare au solde actuel.
--   4. Si écart > 0  : insère une transaction "Recalibrage solde" pour
--      ramener la somme cumulée à la valeur du solde réel
--      (l'historique devient cohérent avec le solde déjà en base, on ne
--       touche PAS aux mouvements existants).
--      → SI L'ÉCART EST POSITIF (solde réel > somme transactions) :
--         on insère un CRÉDIT de la différence.
--      → SI L'ÉCART EST NÉGATIF (solde réel < somme transactions) :
--         on insère un DÉBIT de la différence.
--   5. Affiche un récap.
--
-- ⚠️  Ce script ne touche jamais au solde lui-même : il aligne
--    l'historique. Comme ça, plus aucune perte d'information.
--
-- ⚠️  À exécuter UNE seule fois par compte. Une 2e exécution n'aura
--    rien à corriger (écart = 0).
--
-- ============================================================

DO $$
DECLARE
  -- ─── PARAMÈTRE À MODIFIER ────────────────────────────────────
  v_vban_target  TEXT := 'ENTERMIXOUZDATMB0OQW6JD17ME6RHHR';
  -- ─────────────────────────────────────────────────────────────

  v_compte_id    UUID;
  v_solde_reel   BIGINT;
  v_type         TEXT;
  v_total_credit BIGINT;
  v_total_debit  BIGINT;
  v_somme_tx     BIGINT;
  v_ecart        BIGINT;
BEGIN
  -- 1) Compte
  SELECT id, solde, type
    INTO v_compte_id, v_solde_reel, v_type
  FROM public.felitz_comptes
  WHERE UPPER(REPLACE(vban, ' ', '')) = UPPER(REPLACE(v_vban_target, ' ', ''))
  LIMIT 1;

  IF v_compte_id IS NULL THEN
    RAISE EXCEPTION 'Aucun compte Felitz trouvé pour le VBAN "%"', v_vban_target;
  END IF;

  -- 2) Total cumulé sur TOUTE l'historique
  SELECT
    COALESCE(SUM(montant) FILTER (WHERE type = 'credit'), 0),
    COALESCE(SUM(montant) FILTER (WHERE type = 'debit'),  0)
  INTO v_total_credit, v_total_debit
  FROM public.felitz_transactions
  WHERE compte_id = v_compte_id;

  v_somme_tx := v_total_credit - v_total_debit;
  v_ecart    := v_solde_reel - v_somme_tx;

  -- 3) Affiche le diagnostic
  RAISE NOTICE '────────────────────────────────────────────';
  RAISE NOTICE 'DIAGNOSTIC SOLDE';
  RAISE NOTICE '  VBAN           : %', v_vban_target;
  RAISE NOTICE '  Type compte    : %', v_type;
  RAISE NOTICE '  Solde RÉEL     : % F$', to_char(v_solde_reel,    'FM999G999G999G999');
  RAISE NOTICE '  Somme crédits  : % F$', to_char(v_total_credit,  'FM999G999G999G999');
  RAISE NOTICE '  Somme débits   : % F$', to_char(v_total_debit,   'FM999G999G999G999');
  RAISE NOTICE '  Somme transac. : % F$', to_char(v_somme_tx,      'FM999G999G999G999');
  RAISE NOTICE '  ÉCART          : % F$ (solde - somme)', to_char(v_ecart, 'FMSG999G999G999G999');
  RAISE NOTICE '────────────────────────────────────────────';

  -- 4) Correction si écart non nul
  IF v_ecart = 0 THEN
    RAISE NOTICE 'Solde et historique sont déjà alignés. Aucune correction nécessaire.';
  ELSIF v_ecart > 0 THEN
    -- Solde réel > somme transac. : on a "gagné" de l'argent sans trace.
    -- On ajoute une ligne de CRÉDIT.
    INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
    VALUES (v_compte_id, 'credit', v_ecart,
            'Recalibrage solde — alignement historique (admin)');
    RAISE NOTICE 'Inséré : CRÉDIT de % F$ pour aligner l''historique sur le solde.',
                 to_char(v_ecart, 'FM999G999G999G999');
  ELSE
    -- Solde réel < somme transac. : on a "perdu" de l'argent sans trace.
    -- On ajoute une ligne de DÉBIT.
    INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
    VALUES (v_compte_id, 'debit', ABS(v_ecart),
            'Recalibrage solde — alignement historique (admin)');
    RAISE NOTICE 'Inséré : DÉBIT de % F$ pour aligner l''historique sur le solde.',
                 to_char(ABS(v_ecart), 'FM999G999G999G999');
  END IF;

  RAISE NOTICE '────────────────────────────────────────────';
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  Variante : recalibrer TOUS les comptes en une seule fois
-- ============================================================
--  À utiliser avec précaution. Itère sur tous les comptes ayant un écart
--  entre solde et somme des transactions, et insère une ligne de
--  recalibrage pour chacun.
-- ============================================================

-- DO $$
-- DECLARE
--   r RECORD;
--   v_ecart BIGINT;
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
--     GROUP BY fc.id
--   LOOP
--     v_ecart := r.solde_reel - r.somme_tx;
--     IF v_ecart <> 0 THEN
--       INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
--       VALUES (
--         r.id,
--         CASE WHEN v_ecart > 0 THEN 'credit' ELSE 'debit' END,
--         ABS(v_ecart),
--         'Recalibrage solde — alignement historique (admin batch)'
--       );
--       RAISE NOTICE '% (%): écart % F$ → ligne ajoutée', r.vban, r.type, v_ecart;
--     END IF;
--   END LOOP;
-- END;
-- $$ LANGUAGE plpgsql;


-- ============================================================
--  Vérification post-correction
-- ============================================================

-- SELECT
--   fc.vban,
--   fc.type,
--   fc.solde AS solde_reel,
--   COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
--     - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'), 0) AS somme_tx,
--   fc.solde - (
--     COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'credit'), 0)
--     - COALESCE(SUM(ft.montant) FILTER (WHERE ft.type = 'debit'), 0)
--   ) AS ecart
-- FROM public.felitz_comptes fc
-- LEFT JOIN public.felitz_transactions ft ON ft.compte_id = fc.id
-- WHERE UPPER(REPLACE(fc.vban, ' ', '')) = UPPER(REPLACE('ENTERMIXOUZDATMB0OQW6JD17ME6RHHR', ' ', ''))
-- GROUP BY fc.id;
