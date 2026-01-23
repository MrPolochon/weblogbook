-- ============================================================
-- MIGRATION: Système de taxes et salaires ATC
-- ============================================================

-- Table pour tracker quels ATC ont contrôlé quels plans de vol
-- Un ATC "contrôle" un vol dès qu'il l'a eu dans son interface (acceptation, transfert reçu)
CREATE TABLE IF NOT EXISTS public.atc_plans_controles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_vol_id UUID NOT NULL REFERENCES public.plans_vol(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aeroport TEXT NOT NULL,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_vol_id, user_id, aeroport, position)
);

CREATE INDEX IF NOT EXISTS idx_atc_plans_controles_plan ON public.atc_plans_controles(plan_vol_id);
CREATE INDEX IF NOT EXISTS idx_atc_plans_controles_user ON public.atc_plans_controles(user_id);

-- RLS
ALTER TABLE public.atc_plans_controles ENABLE ROW LEVEL SECURITY;

-- Politiques atc_plans_controles
DROP POLICY IF EXISTS "apc_select" ON public.atc_plans_controles;
CREATE POLICY "apc_select" ON public.atc_plans_controles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "apc_insert" ON public.atc_plans_controles;
CREATE POLICY "apc_insert" ON public.atc_plans_controles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "apc_admin" ON public.atc_plans_controles;
CREATE POLICY "apc_admin" ON public.atc_plans_controles FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Ajouter type de message pour les taxes ATC
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check 
  CHECK (type_message IN ('normal', 'cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'systeme'));
