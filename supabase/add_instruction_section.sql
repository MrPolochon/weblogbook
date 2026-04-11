-- Section instruction: eleves rattaches a un instructeur + avions temporaires

-- 1) Profils: suivi de formation instruction
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instructeur_referent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS formation_instruction_active BOOLEAN NOT NULL DEFAULT false;

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
