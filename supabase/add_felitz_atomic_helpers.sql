-- ============================================================
--  FELITZ BANK : helpers SQL atomiques (débit/crédit + trace)
-- ============================================================
--
-- But : éliminer la classe de bugs où le solde change SANS ligne
-- correspondante dans `felitz_transactions` (et inversement).
--
-- Usage côté code TS :
--   const { data: ok, error } = await admin.rpc('debiter_avec_trace', {
--     p_compte_id: compteId,
--     p_montant: 1000,
--     p_libelle: 'Achat avion XYZ'
--   });
--   if (error || ok === false) { ... gestion solde insuffisant ... }
--
-- Les fonctions :
--   - exécutent l'UPDATE solde + l'INSERT transaction dans la MÊME
--     transaction Postgres (atomique : si l'INSERT échoue, le UPDATE
--     est rollback automatiquement)
--   - retournent BOOLEAN (true = succès, false = solde insuffisant
--     pour le débit / compte introuvable)
--   - SECURITY DEFINER pour s'utiliser depuis tous les contextes
--
-- Schéma de `felitz_transactions` ciblé :
--   (id, compte_id, type, montant, libelle, created_at)
--   PAS de colonne `description`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.debiter_avec_trace(
  p_compte_id UUID,
  p_montant   BIGINT,
  p_libelle   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_montant IS NULL OR p_montant <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Débit atomique : refuse si solde insuffisant
  UPDATE public.felitz_comptes
  SET solde = solde - p_montant
  WHERE id = p_compte_id
    AND solde >= p_montant;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Trace systématique. Si l'INSERT échoue, la fonction throw → rollback
  -- transactionnel du UPDATE ci-dessus.
  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
  VALUES (p_compte_id, 'debit', p_montant, p_libelle);

  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.crediter_avec_trace(
  p_compte_id UUID,
  p_montant   BIGINT,
  p_libelle   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_montant IS NULL OR p_montant <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.felitz_comptes
  SET solde = solde + p_montant
  WHERE id = p_compte_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
  VALUES (p_compte_id, 'credit', p_montant, p_libelle);

  RETURN TRUE;
END;
$$;


-- ============================================================
--  Virement atomique : débit source + crédit dest + 2 traces,
--  le tout dans une seule transaction PG.
-- ============================================================

CREATE OR REPLACE FUNCTION public.virer_avec_trace(
  p_compte_source_id UUID,
  p_compte_dest_id   UUID,
  p_montant          BIGINT,
  p_libelle_source   TEXT,
  p_libelle_dest     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_montant IS NULL OR p_montant <= 0 THEN
    RETURN FALSE;
  END IF;
  IF p_compte_source_id = p_compte_dest_id THEN
    RETURN FALSE;
  END IF;

  -- Débit source
  UPDATE public.felitz_comptes
  SET solde = solde - p_montant
  WHERE id = p_compte_source_id
    AND solde >= p_montant;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Crédit destination
  UPDATE public.felitz_comptes
  SET solde = solde + p_montant
  WHERE id = p_compte_dest_id;

  IF NOT FOUND THEN
    -- Le débit source sera annulé par le rollback automatique
    RAISE EXCEPTION 'Compte destination introuvable';
  END IF;

  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle)
  VALUES
    (p_compte_source_id, 'debit',  p_montant, p_libelle_source),
    (p_compte_dest_id,   'credit', p_montant, p_libelle_dest);

  RETURN TRUE;
END;
$$;


-- Si d'anciennes versions des fonctions avec un paramètre `p_description`
-- existent (du brouillon initial), on les supprime pour éviter toute
-- ambiguïté de surcharge lors des appels RPC.
DROP FUNCTION IF EXISTS public.debiter_avec_trace(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.crediter_avec_trace(UUID, BIGINT, TEXT, TEXT);


-- Permissions : exécutables par les rôles habituels
GRANT EXECUTE ON FUNCTION public.debiter_avec_trace(UUID, BIGINT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crediter_avec_trace(UUID, BIGINT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.virer_avec_trace(UUID, UUID, BIGINT, TEXT, TEXT) TO anon, authenticated, service_role;
