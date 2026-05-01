-- Notes par module (C1, C2, …), archives PDF fin de formation (bucket documents)

ALTER TABLE public.instruction_progression_items
  ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN public.instruction_progression_items.note IS 'Commentaire instructeur pour ce module de formation';

CREATE TABLE IF NOT EXISTS public.instruction_formation_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  eleve_identifiant_snapshot TEXT NOT NULL,
  licence_code TEXT NOT NULL,
  licence_label_snapshot TEXT,
  instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  instructeur_identifiant_snapshot TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'documents',
  storage_path TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_instruction_formation_archives_licence
  ON public.instruction_formation_archives(licence_code);
CREATE INDEX IF NOT EXISTS idx_instruction_formation_archives_eleve
  ON public.instruction_formation_archives(eleve_id);

ALTER TABLE public.instruction_formation_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_formation_archives_select ON public.instruction_formation_archives;
CREATE POLICY instruction_formation_archives_select ON public.instruction_formation_archives
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Aucun insert/update/delete via JWT : uniquement service_role (routes API).
