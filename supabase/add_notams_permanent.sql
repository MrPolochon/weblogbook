-- NOTAMs permanents : restent actifs apres DU jusqu'a suppression manuelle.
-- Aligne aussi les politiques RLS sur les droits applicatifs : admin ou agent IFSA.

ALTER TABLE public.notams
  ADD COLUMN IF NOT EXISTS permanent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notams_permanent
  ON public.notams(permanent)
  WHERE permanent = true;

DROP POLICY IF EXISTS "notams_insert_admin" ON public.notams;
DROP POLICY IF EXISTS "notams_insert_manage" ON public.notams;
CREATE POLICY "notams_insert_manage" ON public.notams
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR ifsa = true)
  ));

DROP POLICY IF EXISTS "notams_update_admin" ON public.notams;
DROP POLICY IF EXISTS "notams_update_manage" ON public.notams;
CREATE POLICY "notams_update_manage" ON public.notams
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR ifsa = true)
  ));

DROP POLICY IF EXISTS "notams_delete_admin" ON public.notams;
DROP POLICY IF EXISTS "notams_delete_manage" ON public.notams;
CREATE POLICY "notams_delete_manage" ON public.notams
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR ifsa = true)
  ));
