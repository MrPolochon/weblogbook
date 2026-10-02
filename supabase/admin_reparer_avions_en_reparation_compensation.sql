-- ============================================================
-- ADMIN — Réparer tous les avions `en_reparation` + compensation
-- Projet : iajcynzzybkomaouxwji
-- ============================================================
-- 1. Remet usure à 100 % et statut `disponible` / `ground`
--    pour tous les appareils en réparation (compagnie, perso, SIAVI)
-- 2. Clôture les demandes de réparation encore ouvertes liées
-- 3. Crédite le compte Felitz du propriétaire :
--      - compagnie  → compte type `entreprise`
--      - inventaire → compte type `personnel`
--      - SIAVI      → compte type `siavi`
--
-- Montant : 10 000 F$ par avion réparé
-- Libellé : compensation admin réparation forcée
--
-- Idempotent : les avions déjà hors `en_reparation` ne sont pas
-- retraités ; les crédits ne sont émis que pour les lignes traitées
-- dans cette transaction.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_compensation BIGINT := 10000;
  v_libelle TEXT := 'compensation admin réparation forcée';
  v_nb_compagnie INT := 0;
  v_nb_inventaire INT := 0;
  v_nb_siavi INT := 0;
  v_nb_demandes INT := 0;
  v_nb_credits INT := 0;
  r RECORD;
  v_ok BOOLEAN;
BEGIN
  -- ----------------------------------------------------------------
  -- 1) Snapshot des avions compagnie à réparer
  -- ----------------------------------------------------------------
  DROP TABLE IF EXISTS _admin_avions_repares;
  CREATE TEMP TABLE _admin_avions_repares (
    source TEXT NOT NULL,
    avion_id UUID NOT NULL,
    owner_key UUID,          -- compagnie_id ou proprietaire_id (NULL pour SIAVI)
    immatriculation TEXT,
    usure_avant NUMERIC
  );

  INSERT INTO _admin_avions_repares (source, avion_id, owner_key, immatriculation, usure_avant)
  SELECT
    'compagnie',
    ca.id,
    ca.compagnie_id,
    ca.immatriculation,
    ca.usure_percent
  FROM public.compagnie_avions ca
  WHERE ca.statut = 'en_reparation'
    AND COALESCE(ca.detruit, FALSE) = FALSE;

  GET DIAGNOSTICS v_nb_compagnie = ROW_COUNT;

  INSERT INTO _admin_avions_repares (source, avion_id, owner_key, immatriculation, usure_avant)
  SELECT
    'inventaire',
    ia.id,
    ia.proprietaire_id,
    ia.immatriculation,
    ia.usure_percent
  FROM public.inventaire_avions ia
  WHERE ia.statut = 'en_reparation';

  GET DIAGNOSTICS v_nb_inventaire = ROW_COUNT;

  INSERT INTO _admin_avions_repares (source, avion_id, owner_key, immatriculation, usure_avant)
  SELECT
    'siavi',
    sa.id,
    NULL,
    sa.immatriculation,
    sa.usure_percent
  FROM public.siavi_avions sa
  WHERE sa.statut = 'en_reparation';

  GET DIAGNOSTICS v_nb_siavi = ROW_COUNT;

  RAISE NOTICE 'Avions à réparer — compagnie: %, inventaire: %, siavi: %',
    v_nb_compagnie, v_nb_inventaire, v_nb_siavi;

  IF (v_nb_compagnie + v_nb_inventaire + v_nb_siavi) = 0 THEN
    RAISE NOTICE 'Aucun avion en réparation. Rien à faire.';
    RETURN;
  END IF;

  -- ----------------------------------------------------------------
  -- 2) Réparer les avions
  -- ----------------------------------------------------------------
  UPDATE public.compagnie_avions ca
  SET
    usure_percent = 100,
    statut = 'disponible'
  FROM _admin_avions_repares a
  WHERE a.source = 'compagnie'
    AND ca.id = a.avion_id
    AND ca.statut = 'en_reparation';

  UPDATE public.inventaire_avions ia
  SET usure_percent = 100, statut = 'ground'
  FROM _admin_avions_repares a
  WHERE a.source = 'inventaire'
    AND ia.id = a.avion_id
    AND ia.statut = 'en_reparation';

  UPDATE public.siavi_avions sa
  SET usure_percent = 100, statut = 'ground'
  FROM _admin_avions_repares a
  WHERE a.source = 'siavi'
    AND sa.id = a.avion_id
    AND sa.statut = 'en_reparation';

  -- ----------------------------------------------------------------
  -- 3) Clôturer les demandes de réparation encore actives
  -- ----------------------------------------------------------------
  UPDATE public.reparation_demandes rd
  SET
    statut = 'completee',
    usure_apres = 100,
    completee_at = COALESCE(rd.completee_at, now()),
    fin_reparation_at = COALESCE(rd.fin_reparation_at, now()),
    retour_transit_eta_at = NULL,
    entreprise_transit_eta_at = NULL
  FROM _admin_avions_repares a
  WHERE a.source = 'compagnie'
    AND rd.avion_id = a.avion_id
    AND rd.statut IN (
      'demandee', 'acceptee', 'en_transit', 'en_reparation', 'mini_jeux',
      'terminee', 'facturee', 'payee', 'retour_transit'
    );

  GET DIAGNOSTICS v_nb_demandes = ROW_COUNT;
  RAISE NOTICE 'Demandes de réparation clôturées: %', v_nb_demandes;

  -- ----------------------------------------------------------------
  -- 4) Compensation Felitz — agrégée par compte propriétaire
  -- ----------------------------------------------------------------
  -- Compagnies
  FOR r IN
    SELECT
      fc.id AS compte_id,
      COUNT(*)::BIGINT AS nb_avions,
      (COUNT(*)::BIGINT * v_compensation) AS montant
    FROM _admin_avions_repares a
    JOIN public.felitz_comptes fc
      ON fc.compagnie_id = a.owner_key
     AND fc.type = 'entreprise'
    WHERE a.source = 'compagnie'
    GROUP BY fc.id
  LOOP
    SELECT public.crediter_avec_trace(r.compte_id, r.montant, v_libelle) INTO v_ok;
    IF COALESCE(v_ok, FALSE) THEN
      v_nb_credits := v_nb_credits + 1;
      RAISE NOTICE 'Crédit compagnie compte % : % F$ (% avions)', r.compte_id, r.montant, r.nb_avions;
    ELSE
      RAISE WARNING 'Échec crédit compagnie compte % montant %', r.compte_id, r.montant;
    END IF;
  END LOOP;

  -- Inventaire personnel
  FOR r IN
    SELECT
      fc.id AS compte_id,
      COUNT(*)::BIGINT AS nb_avions,
      (COUNT(*)::BIGINT * v_compensation) AS montant
    FROM _admin_avions_repares a
    JOIN public.felitz_comptes fc
      ON fc.proprietaire_id = a.owner_key
     AND fc.type = 'personnel'
    WHERE a.source = 'inventaire'
    GROUP BY fc.id
  LOOP
    SELECT public.crediter_avec_trace(r.compte_id, r.montant, v_libelle) INTO v_ok;
    IF COALESCE(v_ok, FALSE) THEN
      v_nb_credits := v_nb_credits + 1;
      RAISE NOTICE 'Crédit personnel compte % : % F$ (% avions)', r.compte_id, r.montant, r.nb_avions;
    ELSE
      RAISE WARNING 'Échec crédit personnel compte % montant %', r.compte_id, r.montant;
    END IF;
  END LOOP;

  -- SIAVI (compte unique)
  IF v_nb_siavi > 0 THEN
    FOR r IN
      SELECT
        fc.id AS compte_id,
        v_nb_siavi::BIGINT AS nb_avions,
        (v_nb_siavi::BIGINT * v_compensation) AS montant
      FROM public.felitz_comptes fc
      WHERE fc.type = 'siavi'
      LIMIT 1
    LOOP
      SELECT public.crediter_avec_trace(r.compte_id, r.montant, v_libelle) INTO v_ok;
      IF COALESCE(v_ok, FALSE) THEN
        v_nb_credits := v_nb_credits + 1;
        RAISE NOTICE 'Crédit SIAVI compte % : % F$ (% avions)', r.compte_id, r.montant, r.nb_avions;
      ELSE
        RAISE WARNING 'Échec crédit SIAVI compte % montant %', r.compte_id, r.montant;
      END IF;
    END LOOP;
  END IF;

  RAISE NOTICE 'Terminé — crédits émis: % comptes', v_nb_credits;
END $$;

COMMIT;

-- Vérifications post-op
SELECT 'compagnie_encore_en_reparation' AS check_name, COUNT(*)::INT AS n
FROM public.compagnie_avions WHERE statut = 'en_reparation' AND COALESCE(detruit, FALSE) = FALSE
UNION ALL
SELECT 'inventaire_encore_en_reparation', COUNT(*)::INT
FROM public.inventaire_avions WHERE statut = 'en_reparation'
UNION ALL
SELECT 'siavi_encore_en_reparation', COUNT(*)::INT
FROM public.siavi_avions WHERE statut = 'en_reparation'
UNION ALL
SELECT 'compensations_emises', COUNT(*)::INT
FROM public.felitz_transactions
WHERE libelle = 'compensation admin réparation forcée'
  AND created_at >= now() - interval '10 minutes';
