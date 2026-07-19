-- Avions fictifs instruction : cycle de vie lié aux sessions training / examen.
-- brouillon = créé par l'instructeur, invisible élève
-- actif     = session démarrée (en_cours), visible inventaire élève
-- supprime  = session clôturée / annulée (ligne conservée brièvement puis DELETE côté appli)

ALTER TABLE public.inventaire_avions
  ADD COLUMN IF NOT EXISTS instruction_session_kind TEXT
    CHECK (instruction_session_kind IS NULL OR instruction_session_kind IN ('pilot_training', 'exam')),
  ADD COLUMN IF NOT EXISTS instruction_session_id UUID,
  ADD COLUMN IF NOT EXISTS instruction_lifecycle TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (instruction_lifecycle IN ('brouillon', 'actif', 'supprime'));

CREATE INDEX IF NOT EXISTS idx_inventaire_instruction_session
  ON public.inventaire_avions(instruction_session_kind, instruction_session_id)
  WHERE instruction_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventaire_instruction_lifecycle
  ON public.inventaire_avions(instruction_lifecycle)
  WHERE instruction_actif = true;

-- Sessions training vol : statuts alignés sur les examens
ALTER TABLE public.instruction_pilot_training_requests
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'assigne';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instruction_pilot_training_requests_statut_check'
  ) THEN
    ALTER TABLE public.instruction_pilot_training_requests
      ADD CONSTRAINT instruction_pilot_training_requests_statut_check
      CHECK (statut IN ('assigne', 'accepte', 'en_cours', 'termine', 'refuse'));
  END IF;
END $$;

-- Avions fictifs legacy (formation longue durée, sans session) : restent visibles tant que actifs
UPDATE public.inventaire_avions
SET instruction_lifecycle = 'actif'
WHERE instruction_actif = true
  AND instruction_session_id IS NULL
  AND instruction_lifecycle = 'brouillon';

-- Nettoyage : avions fictifs liés à une session inexistante
DELETE FROM public.inventaire_avions ia
WHERE ia.instruction_actif = true
  AND ia.instruction_session_id IS NOT NULL
  AND ia.instruction_lifecycle IN ('brouillon', 'actif')
  AND NOT EXISTS (
    SELECT 1 FROM public.instruction_exam_requests er
    WHERE ia.instruction_session_kind = 'exam'
      AND er.id = ia.instruction_session_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.instruction_pilot_training_requests tr
    WHERE ia.instruction_session_kind = 'pilot_training'
      AND tr.id = ia.instruction_session_id
  );

-- Nettoyage : avions fictifs de session déjà close (examen terminé / refusé)
DELETE FROM public.inventaire_avions ia
WHERE ia.instruction_actif = true
  AND ia.instruction_session_kind = 'exam'
  AND ia.instruction_session_id IS NOT NULL
  AND ia.instruction_lifecycle IN ('brouillon', 'actif')
  AND EXISTS (
    SELECT 1 FROM public.instruction_exam_requests er
    WHERE er.id = ia.instruction_session_id
      AND er.statut IN ('termine', 'refuse')
  );
