-- Workflow complet examen: session en cours, résultat, licence, messagerie

-- 1) Étendre les statuts possibles + ajouter colonnes résultat
ALTER TABLE public.instruction_exam_requests
  DROP CONSTRAINT IF EXISTS instruction_exam_requests_statut_check;

ALTER TABLE public.instruction_exam_requests
  ADD CONSTRAINT instruction_exam_requests_statut_check
    CHECK (statut IN ('assigne', 'accepte', 'en_cours', 'termine', 'refuse'));

ALTER TABLE public.instruction_exam_requests
  ADD COLUMN IF NOT EXISTS resultat TEXT CHECK (resultat IN ('reussi', 'echoue')),
  ADD COLUMN IF NOT EXISTS dossier_conserve BOOLEAN,
  ADD COLUMN IF NOT EXISTS licence_creee_id UUID REFERENCES public.licences_qualifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instruction_exam_requests_statut
  ON public.instruction_exam_requests(statut);

-- 2) Table des refus pour ne pas réassigner au même instructeur
CREATE TABLE IF NOT EXISTS public.instruction_exam_request_refusals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.instruction_exam_requests(id) ON DELETE CASCADE,
  instructeur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, instructeur_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_request_refusals_request
  ON public.instruction_exam_request_refusals(request_id);
