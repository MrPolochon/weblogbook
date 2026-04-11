-- Section instruction: eleves rattaches a un instructeur + avions temporaires

-- 1) Profils: suivi de formation instruction
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instructeur_referent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS formation_instruction_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS formation_instruction_licence TEXT DEFAULT 'PPL';

CREATE INDEX IF NOT EXISTS idx_profiles_instructeur_referent
  ON public.profiles(instructeur_referent_id);

-- 2) Inventaire avions: marquage des avions temporaires d'instruction
ALTER TABLE public.inventaire_avions
  ADD COLUMN IF NOT EXISTS instruction_instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instruction_eleve_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instruction_actif BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inventaire_instruction_instructeur
  ON public.inventaire_avions(instruction_instructeur_id);

CREATE INDEX IF NOT EXISTS idx_inventaire_instruction_eleve
  ON public.inventaire_avions(instruction_eleve_id);

CREATE INDEX IF NOT EXISTS idx_inventaire_instruction_actif
  ON public.inventaire_avions(instruction_actif);

-- 3) Progression détaillée de formation (modules C1/C2/... par élève)
CREATE TABLE IF NOT EXISTS public.instruction_progression_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  licence_code TEXT NOT NULL,
  module_code TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(eleve_id, licence_code, module_code)
);

CREATE INDEX IF NOT EXISTS idx_instruction_progression_eleve
  ON public.instruction_progression_items(eleve_id);

-- 4) Demandes d'examen de licence (assignées à un instructeur)
CREATE TABLE IF NOT EXISTS public.instruction_exam_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  licence_code TEXT NOT NULL,
  instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'assigne' CHECK (statut IN ('assigne', 'accepte', 'termine', 'refuse')),
  message TEXT,
  response_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instruction_exam_requests_requester
  ON public.instruction_exam_requests(requester_id);

CREATE INDEX IF NOT EXISTS idx_instruction_exam_requests_instructeur
  ON public.instruction_exam_requests(instructeur_id, statut);
