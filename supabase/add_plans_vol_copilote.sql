-- Copilote sur les plans de vol : validation avant envoi ATC / vol sans ATC

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS copilote_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copilote_valide_at timestamptz,
  ADD COLUMN IF NOT EXISTS copilote_vol_sans_atc boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_plans_vol_copilote_id ON public.plans_vol(copilote_id) WHERE copilote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_vol_statut_copilote ON public.plans_vol(statut) WHERE statut = 'en_attente_copilote';

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut = ANY (ARRAY[
  'depose'::text,
  'en_attente'::text,
  'en_attente_copilote'::text,
  'accepte'::text,
  'refuse'::text,
  'annule'::text,
  'en_cours'::text,
  'automonitoring'::text,
  'en_attente_cloture'::text,
  'cloture'::text,
  'planifie_suivant'::text,
  'en_pause'::text
]));

DROP POLICY IF EXISTS plans_vol_select_copilote ON public.plans_vol;
CREATE POLICY plans_vol_select_copilote ON public.plans_vol
  FOR SELECT TO authenticated
  USING (copilote_id = auth.uid());

DROP POLICY IF EXISTS plans_vol_update_copilote ON public.plans_vol;
CREATE POLICY plans_vol_update_copilote ON public.plans_vol
  FOR UPDATE TO authenticated
  USING (copilote_id = auth.uid());
