-- Règles d'accès ATC par grade
-- 1) Interdictions par grade (optionnellement pour ce grade et les grades inférieurs)
-- 2) Grade minimum requis par aéroport et/ou position

-- ── Interdictions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atc_grade_forbidden (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES public.atc_grades(id) ON DELETE CASCADE,
  aeroport TEXT,
  position TEXT CHECK (
    position IS NULL OR position IN ('Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center')
  ),
  applies_to_lower_grades BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atc_grade_forbidden_target CHECK (aeroport IS NOT NULL OR position IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atc_grade_forbidden_unique
  ON public.atc_grade_forbidden (grade_id, COALESCE(aeroport, ''), COALESCE(position, ''));

CREATE INDEX IF NOT EXISTS idx_atc_grade_forbidden_grade ON public.atc_grade_forbidden(grade_id);

COMMENT ON TABLE public.atc_grade_forbidden IS 'Interdictions ATC : aéroport, position globale, ou paire ; s''applique au grade configuré et optionnellement aux grades inférieurs';
COMMENT ON COLUMN public.atc_grade_forbidden.applies_to_lower_grades IS 'Si true, s''applique aussi aux grades de rang inférieur (ordre plus bas)';

-- ── Grade minimum requis ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atc_position_min_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport TEXT,
  position TEXT CHECK (
    position IS NULL OR position IN ('Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center')
  ),
  min_grade_id UUID NOT NULL REFERENCES public.atc_grades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atc_position_min_grades_target CHECK (aeroport IS NOT NULL OR position IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atc_position_min_grades_unique
  ON public.atc_position_min_grades (COALESCE(aeroport, ''), COALESCE(position, ''));

CREATE INDEX IF NOT EXISTS idx_atc_position_min_grades_grade ON public.atc_position_min_grades(min_grade_id);

COMMENT ON TABLE public.atc_position_min_grades IS 'Grade minimum requis pour ouvrir une position ATC (aéroport, position globale, ou paire)';

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.atc_grade_forbidden ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atc_position_min_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atc_grade_forbidden_select" ON public.atc_grade_forbidden;
CREATE POLICY "atc_grade_forbidden_select" ON public.atc_grade_forbidden
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "atc_grade_forbidden_all_admin" ON public.atc_grade_forbidden;
CREATE POLICY "atc_grade_forbidden_all_admin" ON public.atc_grade_forbidden
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "atc_position_min_grades_select" ON public.atc_position_min_grades;
CREATE POLICY "atc_position_min_grades_select" ON public.atc_position_min_grades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "atc_position_min_grades_all_admin" ON public.atc_position_min_grades;
CREATE POLICY "atc_position_min_grades_all_admin" ON public.atc_position_min_grades
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Migration depuis l'ancien nom (si créé lors d'un essai précédent)
DROP TABLE IF EXISTS public.atc_grade_restrictions;
