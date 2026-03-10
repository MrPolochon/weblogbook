-- ============================================================
-- MIGRATIONS CHECK-UP COMPLET
-- ============================================================
-- Ce fichier regroupe toutes les migrations issues du check-up :
--   1. Password reset tables
--   2. Améliorations compagnies (index, CHECK, updated_at)
--   3. Fix RLS compagnie_locations (pdg_id)
--   4. Fonctions atomiques débit/crédit Felitz
--   5. Renforcement RLS tables IP & superadmin
--   6. Système de revente d'avions (Hangar Market)
--
-- Exécuter dans Supabase SQL Editor en une seule fois.
-- ============================================================


-- ████████████████████████████████████████████████████████████
-- 1) PASSWORD RESET TABLES
-- ████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.password_reset_tokens IS 'Tokens pour le lien de réinitialisation de mot de passe (mot de passe oublié).';

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_reset_tokens_no_access" ON public.password_reset_tokens;
CREATE POLICY "password_reset_tokens_no_access" ON public.password_reset_tokens FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant_or_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.password_reset_requests IS 'Demandes de réinitialisation de mot de passe adressées aux administrateurs.';

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_reset_requests_no_anon" ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_no_anon" ON public.password_reset_requests FOR ALL USING (false);
DROP POLICY IF EXISTS "password_reset_requests_admin_only" ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_admin_only" ON public.password_reset_requests
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ████████████████████████████████████████████████████████████
-- 2) AMÉLIORATIONS TABLE COMPAGNIES
-- ████████████████████████████████████████████████████████████

-- Index pour les RLS et les jointures
CREATE INDEX IF NOT EXISTS idx_compagnies_pdg_id ON public.compagnies(pdg_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_nom ON public.compagnies(nom);

-- Unicité du nom (insensible à la casse)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'compagnies' AND indexname = 'idx_compagnies_nom_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_compagnies_nom_unique ON public.compagnies (lower(trim(nom)));
    RAISE NOTICE '✅ Index unique idx_compagnies_nom_unique créé';
  ELSE
    RAISE NOTICE '⚠️ Index idx_compagnies_nom_unique existe déjà';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE '⚠️ Doublons de noms détectés : corriger les données puis réexécuter.';
    RAISE;
END $$;

-- Corriger les données hors plage AVANT d'ajouter les contraintes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'prix_billet_pax') THEN
    UPDATE public.compagnies SET prix_billet_pax = 0 WHERE prix_billet_pax < 0;
    UPDATE public.compagnies SET prix_billet_pax = 10000000 WHERE prix_billet_pax > 10000000;
    RAISE NOTICE '✅ Données prix_billet_pax normalisées';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'prix_kg_cargo') THEN
    UPDATE public.compagnies SET prix_kg_cargo = 0 WHERE prix_kg_cargo < 0;
    UPDATE public.compagnies SET prix_kg_cargo = 1000000 WHERE prix_kg_cargo > 1000000;
    RAISE NOTICE '✅ Données prix_kg_cargo normalisées';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'pourcentage_salaire') THEN
    UPDATE public.compagnies SET pourcentage_salaire = 0 WHERE pourcentage_salaire < 0;
    UPDATE public.compagnies SET pourcentage_salaire = 100 WHERE pourcentage_salaire > 100;
    RAISE NOTICE '✅ Données pourcentage_salaire normalisées';
  END IF;
END $$;

-- Contraintes CHECK
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'prix_billet_pax') THEN
    ALTER TABLE public.compagnies DROP CONSTRAINT IF EXISTS compagnies_prix_billet_pax_check;
    ALTER TABLE public.compagnies ADD CONSTRAINT compagnies_prix_billet_pax_check CHECK (prix_billet_pax >= 0 AND prix_billet_pax <= 10000000);
    RAISE NOTICE '✅ CHECK prix_billet_pax';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'prix_kg_cargo') THEN
    ALTER TABLE public.compagnies DROP CONSTRAINT IF EXISTS compagnies_prix_kg_cargo_check;
    ALTER TABLE public.compagnies ADD CONSTRAINT compagnies_prix_kg_cargo_check CHECK (prix_kg_cargo >= 0 AND prix_kg_cargo <= 1000000);
    RAISE NOTICE '✅ CHECK prix_kg_cargo';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'pourcentage_salaire') THEN
    ALTER TABLE public.compagnies DROP CONSTRAINT IF EXISTS compagnies_pourcentage_salaire_check;
    ALTER TABLE public.compagnies ADD CONSTRAINT compagnies_pourcentage_salaire_check CHECK (pourcentage_salaire >= 0 AND pourcentage_salaire <= 100);
    RAISE NOTICE '✅ CHECK pourcentage_salaire';
  END IF;
END $$;

-- Code OACI : 3 ou 4 caractères
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'code_oaci') THEN
    ALTER TABLE public.compagnies DROP CONSTRAINT IF EXISTS compagnies_code_oaci_check;
    ALTER TABLE public.compagnies ADD CONSTRAINT compagnies_code_oaci_check
      CHECK (code_oaci IS NULL OR (length(trim(code_oaci)) >= 3 AND length(trim(code_oaci)) <= 4));
    RAISE NOTICE '✅ CHECK code_oaci';
  END IF;
END $$;

-- Colonne updated_at et trigger
ALTER TABLE public.compagnies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
COMMENT ON COLUMN public.compagnies.updated_at IS 'Dernière mise à jour de la ligne';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'compagnies_updated_at') THEN
    CREATE TRIGGER compagnies_updated_at BEFORE UPDATE ON public.compagnies
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    RAISE NOTICE '✅ Trigger compagnies_updated_at créé';
  END IF;
END $$;


-- ████████████████████████████████████████████████████████████
-- 3) FIX RLS COMPAGNIE_LOCATIONS (PDG via compagnies.pdg_id)
-- ████████████████████████████████████████████████████████████

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnie_locations') THEN
    DROP POLICY IF EXISTS "locations_select" ON public.compagnie_locations;
    CREATE POLICY "locations_select" ON public.compagnie_locations
      FOR SELECT TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR locataire_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    DROP POLICY IF EXISTS "locations_insert" ON public.compagnie_locations;
    CREATE POLICY "locations_insert" ON public.compagnie_locations
      FOR INSERT TO authenticated
      WITH CHECK (
        loueur_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    DROP POLICY IF EXISTS "locations_update" ON public.compagnie_locations;
    CREATE POLICY "locations_update" ON public.compagnie_locations
      FOR UPDATE TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR locataire_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      )
      WITH CHECK (
        loueur_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR locataire_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    DROP POLICY IF EXISTS "locations_delete" ON public.compagnie_locations;
    CREATE POLICY "locations_delete" ON public.compagnie_locations
      FOR DELETE TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    RAISE NOTICE '✅ RLS compagnie_locations mis à jour (pdg_id)';
  ELSE
    RAISE NOTICE '⚠️ Table compagnie_locations inexistante, skip';
  END IF;
END $$;


-- ████████████████████████████████████████████████████████████
-- 4) FONCTIONS ATOMIQUES DÉBIT/CRÉDIT FELITZ
-- ████████████████████████████████████████████████████████████

CREATE OR REPLACE FUNCTION public.debiter_compte_safe(p_compte_id UUID, p_montant BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.felitz_comptes
  SET solde = solde - p_montant
  WHERE id = p_compte_id AND solde >= p_montant;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.crediter_compte_safe(p_compte_id UUID, p_montant BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.felitz_comptes
  SET solde = solde + p_montant
  WHERE id = p_compte_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.debiter_compte_safe IS 'Débit atomique — retourne false si solde insuffisant';
COMMENT ON FUNCTION public.crediter_compte_safe IS 'Crédit atomique — retourne false si compte introuvable';


-- ████████████████████████████████████████████████████████████
-- 5) RENFORCEMENT RLS TABLES IP & SUPERADMIN
-- ████████████████████████████████████████████████████████████

-- login_ip_history
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'login_ip_history') THEN
    DROP POLICY IF EXISTS "login_ip_history_no_authenticated" ON public.login_ip_history;
    CREATE POLICY "login_ip_history_no_authenticated" ON public.login_ip_history
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
    RAISE NOTICE '✅ login_ip_history : authenticated bloqué';
  END IF;
END $$;

-- superadmin_access_codes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'superadmin_access_codes') THEN
    DROP POLICY IF EXISTS "superadmin_access_codes_no_authenticated" ON public.superadmin_access_codes;
    CREATE POLICY "superadmin_access_codes_no_authenticated" ON public.superadmin_access_codes
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
    RAISE NOTICE '✅ superadmin_access_codes : authenticated bloqué';
  END IF;
END $$;

-- superadmin_ip_requests
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'superadmin_ip_requests') THEN
    DROP POLICY IF EXISTS "superadmin_ip_requests_no_authenticated" ON public.superadmin_ip_requests;
    CREATE POLICY "superadmin_ip_requests_no_authenticated" ON public.superadmin_ip_requests
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
    RAISE NOTICE '✅ superadmin_ip_requests : authenticated bloqué';
  END IF;
END $$;

-- security_logout
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_logout') THEN
    ALTER TABLE public.security_logout ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "security_logout_no_anon" ON public.security_logout;
    CREATE POLICY "security_logout_no_anon" ON public.security_logout
      FOR ALL TO anon USING (false) WITH CHECK (false);
    DROP POLICY IF EXISTS "security_logout_no_authenticated" ON public.security_logout;
    CREATE POLICY "security_logout_no_authenticated" ON public.security_logout
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
    RAISE NOTICE '✅ security_logout : anon + authenticated bloqués';
  END IF;
END $$;


-- ████████████████████████████████████████████████████████████
-- 6) SYSTÈME DE REVENTE D'AVIONS (HANGAR MARKET)
-- ████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.hangar_market_reventes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demandeur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventaire_avion_id UUID REFERENCES public.inventaire_avions(id) ON DELETE SET NULL,
  compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  type_avion_id UUID NOT NULL,
  prix_initial BIGINT NOT NULL,
  pourcentage_demande INT NOT NULL DEFAULT 50 CHECK (pourcentage_demande >= 50 AND pourcentage_demande <= 100),
  montant_revente BIGINT NOT NULL,
  raison TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('approuvee', 'refusee', 'en_attente', 'executee')),
  admin_id UUID REFERENCES public.profiles(id),
  admin_commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ,
  execute_at TIMESTAMPTZ
);

ALTER TABLE public.hangar_market_reventes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reventes_no_anon" ON public.hangar_market_reventes;
CREATE POLICY "reventes_no_anon" ON public.hangar_market_reventes
  FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "reventes_select_own" ON public.hangar_market_reventes;
CREATE POLICY "reventes_select_own" ON public.hangar_market_reventes
  FOR SELECT TO authenticated
  USING (
    demandeur_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_reventes_demandeur ON public.hangar_market_reventes(demandeur_id);
CREATE INDEX IF NOT EXISTS idx_reventes_statut ON public.hangar_market_reventes(statut);


-- ════════════════════════════════════════════════════════════
-- FIN DES MIGRATIONS
-- ════════════════════════════════════════════════════════════
