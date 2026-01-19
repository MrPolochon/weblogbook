-- ============================================================
-- Espace ATC : profils, grades, sessions, plans de vol
-- Exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1) Profiles : encoche ATC, rôle 'atc', grade
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc BOOLEAN NOT NULL DEFAULT false;

-- 2) Grades ATC (ordre = hiérarchie, plus bas = plus élevé)
CREATE TABLE IF NOT EXISTS public.atc_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc_grade_id UUID REFERENCES public.atc_grades(id) ON DELETE SET NULL;

-- 3) Sessions ATC (qui est en service où) — UNIQUE (aeroport, position)
CREATE TABLE IF NOT EXISTS public.atc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aeroport TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(aeroport, position)
);

CREATE INDEX IF NOT EXISTS idx_atc_sessions_user ON public.atc_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_atc_sessions_aeroport ON public.atc_sessions(aeroport);

-- 4) Plans de vol (dépôts pilotes)
-- statut: depose, en_attente, accepte, refuse, en_cours, automonitoring, cloture
-- current_holder_* = chez quel ATC (null si refusé, déposé non encore routé, automonitoring, ou clôturé)
CREATE TABLE IF NOT EXISTS public.plans_vol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aeroport_depart TEXT NOT NULL,
  aeroport_arrivee TEXT NOT NULL,
  numero_vol TEXT NOT NULL,
  porte TEXT,
  temps_prev_min INTEGER NOT NULL,
  type_vol TEXT NOT NULL CHECK (type_vol IN ('VFR', 'IFR')),
  intentions_vol TEXT,
  sid_depart TEXT,
  star_arrivee TEXT,
  statut TEXT NOT NULL DEFAULT 'depose' CHECK (statut IN (
    'depose', 'en_attente', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'cloture'
  )),
  refusal_reason TEXT,
  instructions TEXT,
  current_holder_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_holder_position TEXT,
  current_holder_aeroport TEXT,
  automonitoring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_vol_pilote ON public.plans_vol(pilote_id);
CREATE INDEX IF NOT EXISTS idx_plans_vol_statut ON public.plans_vol(statut);
CREATE INDEX IF NOT EXISTS idx_plans_vol_holder ON public.plans_vol(current_holder_user_id);

-- RLS
ALTER TABLE public.atc_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atc_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans_vol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atc_grades_select" ON public.atc_grades FOR SELECT TO authenticated USING (true);
CREATE POLICY "atc_grades_all_admin" ON public.atc_grades FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "atc_sessions_select" ON public.atc_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "atc_sessions_insert" ON public.atc_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "atc_sessions_update" ON public.atc_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "atc_sessions_delete" ON public.atc_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "plans_vol_select_pilote" ON public.plans_vol FOR SELECT TO authenticated
  USING (pilote_id = auth.uid());
CREATE POLICY "plans_vol_select_holder" ON public.plans_vol FOR SELECT TO authenticated
  USING (current_holder_user_id = auth.uid());
CREATE POLICY "plans_vol_select_admin" ON public.plans_vol FOR SELECT TO authenticated
  USING (public.is_admin());
-- Permettre à tout ATC (atc=true ou admin) de voir les plans (pour automonitoring et transferts)
CREATE POLICY "plans_vol_select_atc" ON public.plans_vol FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (atc = true OR role = 'admin'))
  );
CREATE POLICY "plans_vol_insert" ON public.plans_vol FOR INSERT TO authenticated
  WITH CHECK (pilote_id = auth.uid());
CREATE POLICY "plans_vol_update" ON public.plans_vol FOR UPDATE TO authenticated
  USING (
    pilote_id = auth.uid()
    OR current_holder_user_id = auth.uid()
    OR public.is_admin()
  );

CREATE TRIGGER plans_vol_updated_at BEFORE UPDATE ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
