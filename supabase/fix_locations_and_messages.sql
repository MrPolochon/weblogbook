-- ============================================================
-- FIX: Contrainte messages + RLS compagnie_locations
-- ============================================================
-- Problèmes identifiés lors de l'audit :
-- 1. type_message 'location_avion' invalide (contrainte)
-- 2. compagnie_locations sans RLS (CRITIQUE)
-- 3. Politiques UPDATE sur atc_calls
-- ============================================================

-- 1. Ajouter 'location_avion' et types SIAVI aux types de messages valides
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type_message IN (
    'normal', 
    'cheque_salaire', 
    'cheque_revenu_compagnie', 
    'cheque_taxes_atc', 
    'recrutement', 
    'sanction_ifsa', 
    'amende_ifsa', 
    'relance_amende', 
    'location_avion',
    'cheque_siavi_intervention',
    'cheque_siavi_taxes'
  ));

-- 2. Activer RLS sur compagnie_locations (si elle existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnie_locations') THEN
    ALTER TABLE public.compagnie_locations ENABLE ROW LEVEL SECURITY;
    
    -- Politique SELECT : voir les locations où on est loueur ou locataire
    DROP POLICY IF EXISTS "locations_select" ON public.compagnie_locations;
    CREATE POLICY "locations_select" ON public.compagnie_locations
      FOR SELECT
      TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR locataire_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    -- Politique INSERT : créer une location pour une compagnie dont on est PDG
    DROP POLICY IF EXISTS "locations_insert" ON public.compagnie_locations;
    CREATE POLICY "locations_insert" ON public.compagnie_locations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        loueur_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    -- Politique UPDATE : modifier une location où on est loueur ou locataire PDG
    DROP POLICY IF EXISTS "locations_update" ON public.compagnie_locations;
    CREATE POLICY "locations_update" ON public.compagnie_locations
      FOR UPDATE
      TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR locataire_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      )
      WITH CHECK (
        loueur_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR locataire_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );

    -- Politique DELETE : annuler une location où on est loueur PDG
    DROP POLICY IF EXISTS "locations_delete" ON public.compagnie_locations;
    CREATE POLICY "locations_delete" ON public.compagnie_locations
      FOR DELETE
      TO authenticated
      USING (
        loueur_compagnie_id IN (SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid() AND role = 'PDG')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );
    
    RAISE NOTICE '✅ RLS activé sur compagnie_locations';
  ELSE
    RAISE NOTICE '⚠️ Table compagnie_locations n''existe pas, skip';
  END IF;
END $$;

-- 3. Ajouter politique UPDATE sur atc_calls (si elle existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'atc_calls') THEN
    DROP POLICY IF EXISTS "atc_calls_update" ON public.atc_calls;
    CREATE POLICY "atc_calls_update" ON public.atc_calls
      FOR UPDATE
      TO authenticated
      USING (
        from_user_id = auth.uid()
        OR to_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      )
      WITH CHECK (
        from_user_id = auth.uid()
        OR to_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role IS NULL))
      );
    
    RAISE NOTICE '✅ Politique UPDATE sur atc_calls ajoutée';
  ELSE
    RAISE NOTICE '⚠️ Table atc_calls n''existe pas, skip';
  END IF;
END $$;

-- Vérification finale
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ MIGRATION TERMINÉE';
  RAISE NOTICE '==============================================';
END $$;
