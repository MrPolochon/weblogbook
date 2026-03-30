-- =============================================================================
-- Déduplication felitz_comptes (plusieurs lignes pour le même pilote / compagnie)
-- =============================================================================
-- Provoque des échecs .single() côté API et des listes admin en double.
-- 1) Conserve le compte le plus ancien (created_at, puis id).
-- 2) Fusionne les soldes des doublons sur ce compte référent.
-- 3) Recâble transactions, virements, messages, sanctions IFSA.
-- 4) Supprime les lignes en trop.
--
-- Exécuter UNE FOIS sur Supabase (SQL Editor) après sauvegarde.
-- Ensuite, appliquer les index uniques en fin de fichier.
-- =============================================================================

BEGIN;

-- --- Comptes personnels (type = personnel, même proprietaire_id)
DO $$
DECLARE
  r RECORD;
  keeper UUID;
  dup RECORD;
  s BIGINT;
BEGIN
  FOR r IN
    SELECT proprietaire_id AS pid
    FROM public.felitz_comptes
    WHERE type = 'personnel' AND proprietaire_id IS NOT NULL
    GROUP BY proprietaire_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM public.felitz_comptes
    WHERE type = 'personnel' AND proprietaire_id = r.pid
    ORDER BY created_at ASC NULLS FIRST, id ASC
    LIMIT 1;

    FOR dup IN
      SELECT id, solde FROM public.felitz_comptes
      WHERE type = 'personnel' AND proprietaire_id = r.pid AND id <> keeper
    LOOP
      s := COALESCE(dup.solde, 0);
      UPDATE public.felitz_comptes SET solde = solde + s WHERE id = keeper;

      UPDATE public.felitz_transactions SET compte_id = keeper WHERE compte_id = dup.id;
      UPDATE public.felitz_virements SET compte_source_id = keeper WHERE compte_source_id = dup.id;
      UPDATE public.messages SET cheque_destinataire_compte_id = keeper
      WHERE cheque_destinataire_compte_id = dup.id;

      DELETE FROM public.felitz_comptes WHERE id = dup.id;
    END LOOP;
  END LOOP;
END $$;

-- --- Comptes entreprise (type = entreprise, même compagnie_id)
DO $$
DECLARE
  r RECORD;
  keeper UUID;
  dup RECORD;
  s BIGINT;
BEGIN
  FOR r IN
    SELECT compagnie_id AS cid
    FROM public.felitz_comptes
    WHERE type = 'entreprise' AND compagnie_id IS NOT NULL
    GROUP BY compagnie_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM public.felitz_comptes
    WHERE type = 'entreprise' AND compagnie_id = r.cid
    ORDER BY created_at ASC NULLS FIRST, id ASC
    LIMIT 1;

    FOR dup IN
      SELECT id, solde FROM public.felitz_comptes
      WHERE type = 'entreprise' AND compagnie_id = r.cid AND id <> keeper
    LOOP
      s := COALESCE(dup.solde, 0);
      UPDATE public.felitz_comptes SET solde = solde + s WHERE id = keeper;

      UPDATE public.felitz_transactions SET compte_id = keeper WHERE compte_id = dup.id;
      UPDATE public.felitz_virements SET compte_source_id = keeper WHERE compte_source_id = dup.id;
      UPDATE public.messages SET cheque_destinataire_compte_id = keeper
      WHERE cheque_destinataire_compte_id = dup.id;

      DELETE FROM public.felitz_comptes WHERE id = dup.id;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- Empêche la réapparition de doublons (échoue tant que des doublons restent).
CREATE UNIQUE INDEX IF NOT EXISTS felitz_comptes_uniq_personnel_proprietaire
  ON public.felitz_comptes (proprietaire_id)
  WHERE type = 'personnel' AND proprietaire_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS felitz_comptes_uniq_entreprise_compagnie
  ON public.felitz_comptes (compagnie_id)
  WHERE type = 'entreprise' AND compagnie_id IS NOT NULL;
