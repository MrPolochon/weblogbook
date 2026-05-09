-- ============================================================
--  ADMIN — Créditer un compte Felitz par VBAN (avec trace)
-- ============================================================
--
-- Utilisation :
--   1. Modifier les variables ci-dessous (VBAN, MONTANT, LIBELLÉ).
--   2. Exécuter dans Supabase → SQL Editor.
--   3. Le script :
--        - cherche le compte par VBAN (insensible à la casse, espaces ignorés)
--        - crédite le solde
--        - insère une ligne dans `felitz_transactions` (atomique : si l'INSERT
--          échoue, le crédit est rollback automatiquement)
--        - affiche l'avant/après pour vérification
--
--  ⚠️  À exécuter UNE seule fois par opération. Si tu relances, ça re-crédite.
-- ============================================================

DO $$
DECLARE
  -- ─── PARAMÈTRES À MODIFIER ──────────────────────────────────
  v_vban_target  TEXT   := 'ENTERMIXOUZDATMB0OQW6JD17ME6RHHR';   -- VBAN cible
  v_montant      BIGINT := 7690040;                              -- Montant en F$ (entier > 0)
  v_libelle      TEXT   := 'correction incohérence supabase robot';
  -- ─────────────────────────────────────────────────────────────

  v_compte_id    UUID;
  v_solde_avant  BIGINT;
  v_solde_apres  BIGINT;
  v_type         TEXT;
BEGIN
  -- 1) Recherche du compte par VBAN (tolère espaces et casse)
  SELECT id, solde, type
    INTO v_compte_id, v_solde_avant, v_type
  FROM public.felitz_comptes
  WHERE UPPER(REPLACE(vban, ' ', '')) = UPPER(REPLACE(v_vban_target, ' ', ''))
  LIMIT 1;

  IF v_compte_id IS NULL THEN
    RAISE EXCEPTION 'Aucun compte Felitz trouvé pour le VBAN "%"', v_vban_target;
  END IF;

  IF v_montant IS NULL OR v_montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide : % (doit être > 0)', v_montant;
  END IF;

  -- 2) Crédit + trace dans une seule transaction PG (atomique)
  UPDATE public.felitz_comptes
  SET solde = solde + v_montant
  WHERE id = v_compte_id
  RETURNING solde INTO v_solde_apres;

  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
  VALUES (v_compte_id, 'credit', v_montant, v_libelle);

  -- 3) Récap
  RAISE NOTICE '────────────────────────────────────────────';
  RAISE NOTICE 'CRÉDIT EFFECTUÉ';
  RAISE NOTICE '  VBAN        : %', v_vban_target;
  RAISE NOTICE '  Type compte : %', v_type;
  RAISE NOTICE '  Compte ID   : %', v_compte_id;
  RAISE NOTICE '  Libellé     : %', v_libelle;
  RAISE NOTICE '  Montant     : + % F$', to_char(v_montant, 'FM999G999G999G999');
  RAISE NOTICE '  Solde avant : % F$', to_char(v_solde_avant, 'FM999G999G999G999');
  RAISE NOTICE '  Solde après : % F$', to_char(v_solde_apres, 'FM999G999G999G999');
  RAISE NOTICE '────────────────────────────────────────────';
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  VARIANTE — Débiter un compte par VBAN (refus si solde insuffisant)
-- ============================================================
--  Décommenter et ajuster pour faire un débit administratif.
-- ============================================================

-- DO $$
-- DECLARE
--   v_vban_target  TEXT   := 'MIXOU-XXXX-XXXX';
--   v_montant      BIGINT := 50000;
--   v_libelle      TEXT   := 'Débit administratif';
--
--   v_compte_id    UUID;
--   v_solde_avant  BIGINT;
--   v_solde_apres  BIGINT;
-- BEGIN
--   SELECT id, solde INTO v_compte_id, v_solde_avant
--   FROM public.felitz_comptes
--   WHERE UPPER(REPLACE(vban, ' ', '')) = UPPER(REPLACE(v_vban_target, ' ', ''))
--   LIMIT 1;
--
--   IF v_compte_id IS NULL THEN
--     RAISE EXCEPTION 'Aucun compte trouvé pour le VBAN "%"', v_vban_target;
--   END IF;
--
--   UPDATE public.felitz_comptes
--   SET solde = solde - v_montant
--   WHERE id = v_compte_id AND solde >= v_montant
--   RETURNING solde INTO v_solde_apres;
--
--   IF v_solde_apres IS NULL THEN
--     RAISE EXCEPTION 'Solde insuffisant : solde actuel = % F$, débit demandé = % F$', v_solde_avant, v_montant;
--   END IF;
--
--   INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
--   VALUES (v_compte_id, 'debit', v_montant, v_libelle);
--
--   RAISE NOTICE 'DÉBIT % F$ sur % — solde % → % F$', v_montant, v_vban_target, v_solde_avant, v_solde_apres;
-- END;
-- $$ LANGUAGE plpgsql;


-- ============================================================
--  Vérification rapide (à exécuter séparément après le crédit)
-- ============================================================

-- SELECT vban, type, solde
-- FROM public.felitz_comptes
-- WHERE UPPER(REPLACE(vban, ' ', '')) = UPPER(REPLACE('MIXOU-XXXX-XXXX', ' ', ''));
--
-- SELECT type, montant, libelle, created_at
-- FROM public.felitz_transactions
-- WHERE compte_id = (
--   SELECT id FROM public.felitz_comptes
--   WHERE UPPER(REPLACE(vban, ' ', '')) = UPPER(REPLACE('MIXOU-XXXX-XXXX', ' ', ''))
--   LIMIT 1
-- )
-- ORDER BY created_at DESC
-- LIMIT 5;
