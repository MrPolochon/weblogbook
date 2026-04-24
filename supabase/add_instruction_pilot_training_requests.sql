-- Sessions de training vol (demandeur en formation pilote ↔ FI prioritaire, sinon FE).
-- Même cycle de vie que instruction_atc_training_requests (clôture = suppression côté appli).
CREATE TABLE IF NOT EXISTS public.instruction_pilot_training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_train_req_requester
  ON public.instruction_pilot_training_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_train_req_assignee
  ON public.instruction_pilot_training_requests(assignee_id, created_at DESC);
