-- Licences et qualifications des utilisateurs
-- Exécuter dans l'éditeur SQL Supabase

CREATE TABLE IF NOT EXISTS public.licences_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'PPL', 'CPL', 'ATPL',
    'IR ME',
    'Qualification Type',
    'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
    'C1', 'C2', 'C3', 'C4', 'C6',
    'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
    'IFR', 'VFR',
    'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
    'CAL-ATC', 'CAL-AFIS',
    'PCAL-ATC', 'PCAL-AFIS',
    'LPAFIS', 'LATC'
  )),
  type_avion_id UUID REFERENCES public.types_avion(id) ON DELETE SET NULL,
  langue TEXT,
  date_delivrance DATE,
  date_expiration DATE,
  a_vie BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_licences_user ON public.licences_qualifications(user_id);
CREATE INDEX IF NOT EXISTS idx_licences_type_avion ON public.licences_qualifications(type_avion_id);

ALTER TABLE public.licences_qualifications ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres licences
CREATE POLICY "licences_select_self" ON public.licences_qualifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Les admins peuvent tout voir
CREATE POLICY "licences_select_admin" ON public.licences_qualifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Les admins peuvent créer des licences pour n'importe qui
CREATE POLICY "licences_insert_admin" ON public.licences_qualifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Les admins peuvent modifier toutes les licences
CREATE POLICY "licences_update_admin" ON public.licences_qualifications FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Les admins peuvent supprimer toutes les licences
CREATE POLICY "licences_delete_admin" ON public.licences_qualifications FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
