-- NOTAMs (Notices to Airmen) : visibles par pilotes et ATC, créés par les admins.
-- Structure : identifiant [OACI]-[Axxxx/YY], validité DU/AU, A) lieu géo, E) description, etc.

CREATE TABLE IF NOT EXISTS public.notams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant TEXT NOT NULL UNIQUE,
  code_aeroport TEXT NOT NULL,
  du_at TIMESTAMPTZ NOT NULL,
  au_at TIMESTAMPTZ NOT NULL,
  champ_a TEXT,
  champ_e TEXT NOT NULL,
  champ_d TEXT,
  champ_q TEXT,
  priorite TEXT,
  reference_fr TEXT,
  annule BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notams_au_at ON public.notams(au_at DESC);
CREATE INDEX IF NOT EXISTS idx_notams_annule ON public.notams(annule) WHERE annule = false;

ALTER TABLE public.notams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notams_select_authenticated" ON public.notams;
CREATE POLICY "notams_select_authenticated" ON public.notams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "notams_insert_admin" ON public.notams;
CREATE POLICY "notams_insert_admin" ON public.notams
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "notams_update_admin" ON public.notams;
CREATE POLICY "notams_update_admin" ON public.notams
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "notams_delete_admin" ON public.notams;
CREATE POLICY "notams_delete_admin" ON public.notams
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
