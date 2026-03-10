-- ============================================================
-- Améliorations table compagnies
-- ============================================================
-- Index, unicité du nom, contraintes CHECK, updated_at
-- ============================================================

-- 1) Index pour les RLS et les jointures
CREATE INDEX IF NOT EXISTS idx_compagnies_pdg_id ON public.compagnies(pdg_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_nom ON public.compagnies(nom);

-- 2) Unicité du nom (insensible à la casse)
-- Si des doublons existent, corriger les données avant d'exécuter.
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

-- 3) Corriger les données hors plage AVANT d'ajouter les contraintes
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
    RAISE NOTICE '✅ Données pourcentage_salaire normalisées (valeurs > 100 ramenées à 100)';
  END IF;
END $$;

-- 4) Contraintes CHECK sur les montants (si les colonnes existent)
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

-- 5) Code OACI : 3 ou 4 caractères (si la colonne existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnies' AND column_name = 'code_oaci') THEN
    ALTER TABLE public.compagnies DROP CONSTRAINT IF EXISTS compagnies_code_oaci_check;
    ALTER TABLE public.compagnies ADD CONSTRAINT compagnies_code_oaci_check
      CHECK (code_oaci IS NULL OR (length(trim(code_oaci)) >= 3 AND length(trim(code_oaci)) <= 4));
    RAISE NOTICE '✅ CHECK code_oaci';
  END IF;
END $$;

-- 6) Colonne updated_at et trigger
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
