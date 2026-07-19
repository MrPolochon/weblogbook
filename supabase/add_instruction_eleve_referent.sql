-- =============================================================================
-- Instructeur référent (assignation training / examens)
-- Un élève peut avoir au plus un référent d'assignation distinct du référent
-- de formation (profiles.instructeur_referent_id).
-- Priorité à la création de demandes : référent disponible et éligible, sinon
-- retour à l'algorithme least-busy existant.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instruction_eleve_referent (
  eleve_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  instructeur_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (eleve_id),
  CONSTRAINT instruction_eleve_referent_no_self CHECK (eleve_id <> instructeur_id)
);

CREATE INDEX IF NOT EXISTS instruction_eleve_referent_instructeur_idx
  ON public.instruction_eleve_referent (instructeur_id);

COMMENT ON TABLE public.instruction_eleve_referent IS
  'Référent d''assignation pour training et examens (priorité automatique si disponible et éligible).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.instruction_eleve_referent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruction_eleve_referent_select ON public.instruction_eleve_referent;
CREATE POLICY instruction_eleve_referent_select ON public.instruction_eleve_referent
  FOR SELECT TO authenticated
  USING (
    eleve_id = auth.uid()
    OR instructeur_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_eleve_referent_insert ON public.instruction_eleve_referent;
CREATE POLICY instruction_eleve_referent_insert ON public.instruction_eleve_referent
  FOR INSERT TO authenticated
  WITH CHECK (
    instructeur_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS instruction_eleve_referent_update ON public.instruction_eleve_referent;
CREATE POLICY instruction_eleve_referent_update ON public.instruction_eleve_referent
  FOR UPDATE TO authenticated
  USING (instructeur_id = auth.uid() OR public.is_admin())
  WITH CHECK (instructeur_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS instruction_eleve_referent_delete ON public.instruction_eleve_referent;
CREATE POLICY instruction_eleve_referent_delete ON public.instruction_eleve_referent
  FOR DELETE TO authenticated
  USING (instructeur_id = auth.uid() OR public.is_admin());
