-- ============================================================
-- MIGRATIONS WEBLOGBOOK — à coller dans l'éditeur SQL Supabase
-- Si une erreur "already exists" apparaît, c'est que c'est déjà fait : passe au bloc suivant ou ignore.
-- La fonction set_updated_at() doit exister (créée par schema.sql). Si erreur sur le trigger plans_vol, exécute d'abord schema.sql ou crée la fonction.
-- ============================================================

-- ----- 1) Aéroports départ/arrivée -----
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS aeroport_depart TEXT,
  ADD COLUMN IF NOT EXISTS aeroport_arrivee TEXT;

-- ----- 2) Co-pilote -----
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS copilote_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copilote_confirme_par_pilote BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "vols_select_copilote" ON public.vols;
CREATE POLICY "vols_select_copilote" ON public.vols FOR SELECT TO authenticated
  USING (copilote_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_vols_copilote ON public.vols(copilote_id);

-- ----- 3) Instruction (instructeur, type) -----
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction'));

ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instruction_type TEXT;

-- ----- 4) Statuts confirmation pilote/copilote -----
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_statut_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_statut_check
  CHECK (statut IN ('en_attente', 'validé', 'refusé', 'en_attente_confirmation_pilote', 'en_attente_confirmation_copilote', 'refuse_par_copilote', 'en_attente_confirmation_instructeur'));

-- ----- 5) Callsign -----
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS callsign TEXT;

-- ----- 6) Armée -----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS armee BOOLEAN NOT NULL DEFAULT false;

-- ----- 7) Vol militaire -----
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction', 'Vol militaire'));

ALTER TABLE public.vols ALTER COLUMN type_avion_id DROP NOT NULL;

ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS type_avion_militaire TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS escadrille_ou_escadron TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS chef_escadron_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS nature_vol_militaire TEXT;
ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS nature_vol_militaire_autre TEXT;

-- ----- 8) Équipage militaire (escadrille/escadron) -----
CREATE TABLE IF NOT EXISTS public.vols_equipage_militaire (
  vol_id UUID NOT NULL REFERENCES public.vols(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (vol_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_vols_equipage_militaire_profile ON public.vols_equipage_militaire(profile_id);

-- ----- 9) Espace ATC -----
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.atc_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc_grade_id UUID REFERENCES public.atc_grades(id) ON DELETE SET NULL;

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

ALTER TABLE public.atc_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atc_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans_vol ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atc_grades_select" ON public.atc_grades;
CREATE POLICY "atc_grades_select" ON public.atc_grades FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atc_grades_all_admin" ON public.atc_grades;
CREATE POLICY "atc_grades_all_admin" ON public.atc_grades FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "atc_sessions_select" ON public.atc_sessions;
CREATE POLICY "atc_sessions_select" ON public.atc_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atc_sessions_insert" ON public.atc_sessions;
CREATE POLICY "atc_sessions_insert" ON public.atc_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "atc_sessions_update" ON public.atc_sessions;
CREATE POLICY "atc_sessions_update" ON public.atc_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "atc_sessions_delete" ON public.atc_sessions;
CREATE POLICY "atc_sessions_delete" ON public.atc_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plans_vol_select_pilote" ON public.plans_vol;
CREATE POLICY "plans_vol_select_pilote" ON public.plans_vol FOR SELECT TO authenticated
  USING (pilote_id = auth.uid());
DROP POLICY IF EXISTS "plans_vol_select_holder" ON public.plans_vol;
CREATE POLICY "plans_vol_select_holder" ON public.plans_vol FOR SELECT TO authenticated
  USING (current_holder_user_id = auth.uid());
DROP POLICY IF EXISTS "plans_vol_select_admin" ON public.plans_vol;
CREATE POLICY "plans_vol_select_admin" ON public.plans_vol FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "plans_vol_select_atc" ON public.plans_vol;
CREATE POLICY "plans_vol_select_atc" ON public.plans_vol FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (atc = true OR role = 'admin'))
  );
DROP POLICY IF EXISTS "plans_vol_insert" ON public.plans_vol;
CREATE POLICY "plans_vol_insert" ON public.plans_vol FOR INSERT TO authenticated
  WITH CHECK (pilote_id = auth.uid());
DROP POLICY IF EXISTS "plans_vol_update" ON public.plans_vol;
CREATE POLICY "plans_vol_update" ON public.plans_vol FOR UPDATE TO authenticated
  USING (
    pilote_id = auth.uid()
    OR current_holder_user_id = auth.uid()
    OR public.is_admin()
  );

DROP TRIGGER IF EXISTS plans_vol_updated_at ON public.plans_vol;
CREATE TRIGGER plans_vol_updated_at BEFORE UPDATE ON public.plans_vol
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
