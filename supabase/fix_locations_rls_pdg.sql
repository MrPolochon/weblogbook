-- ============================================================
-- FIX RLS compagnie_locations : PDG via compagnies.pdg_id
-- ============================================================
-- La table compagnie_employes n'a pas de colonne "role".
-- Le PDG est déterminé par compagnies.pdg_id.
-- Ce script recrée les policies en utilisant pdg_id.
-- ============================================================

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
