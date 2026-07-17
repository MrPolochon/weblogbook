-- Historique des sessions de training clôturées (par licence visée).
-- Les demandes ouvertes restent dans instruction_*_training_requests ;
-- à la clôture, une ligne est insérée ici puis la demande est supprimée.

ALTER TABLE public.instruction_pilot_training_requests
  ADD COLUMN IF NOT EXISTS licence_code TEXT;

ALTER TABLE public.instruction_atc_training_requests
  ADD COLUMN IF NOT EXISTS licence_code TEXT;

CREATE TABLE IF NOT EXISTS public.instruction_training_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  licence_code TEXT NOT NULL,
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_completions_requester_licence
  ON public.instruction_training_completions(requester_id, licence_code);

CREATE INDEX IF NOT EXISTS idx_training_completions_requester_instructor
  ON public.instruction_training_completions(requester_id, licence_code, instructor_id);

ALTER TABLE public.instruction_training_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_training_completions_select ON public.instruction_training_completions;
CREATE POLICY instruction_training_completions_select ON public.instruction_training_completions
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());

-- Insert/update/delete : service_role uniquement (routes API).
