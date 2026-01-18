-- ============================================================
-- LOGBOOK - Schéma Supabase
-- Exécuter dans l'éditeur SQL du projet Supabase
-- ============================================================

-- Désactiver l'inscription publique (à faire dans Dashboard > Auth > Providers > Email)
-- ou via: ALTER ROLE authenticator SET request.jwt.claim.email = '';

-- ------------------------------------------------------------
-- PROFILES (lié à auth.users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identifiant TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'pilote' CHECK (role IN ('admin', 'pilote')),
  heures_initiales_minutes INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- COMPAGNIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compagnies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- TYPES D'AVION
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.types_avion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  constructeur TEXT DEFAULT '',
  ordre INTEGER NOT NULL DEFAULT 0
);

-- Seed des types d'avion (ignoré si déjà présents)
INSERT INTO public.types_avion (nom, constructeur, ordre) VALUES
('Cessna Caravane', 'Cessna', 1),
('ATR72', 'ATR', 2),
('E190', 'Embraer', 3),
('A220', 'Airbus', 4),
('A320', 'Airbus', 5),
('B737', 'Boeing', 6),
('B757', 'Boeing', 7),
('B727', 'Boeing', 8),
('B767', 'Boeing', 9),
('A330', 'Airbus', 10),
('B787', 'Boeing', 11),
('C-130 Cargo', 'Boeing', 12),
('B707', 'Boeing', 13),
('DC10', 'Douglas', 14),
('MD-11 Cargo', 'Boeing', 15),
('A340', 'Airbus', 16),
('AN-22', 'Boeing', 17),
('A350', 'Airbus', 18),
('B777', 'Boeing', 19),
('B747', 'Boeing', 20),
('A380', 'Airbus', 21),
('BelugaXL', 'Airbus', 22),
('Dreamlifter', 'Boeing', 23),
('CONCORDE', '', 24),
('AN-225', 'Boeing', 25)
ON CONFLICT (nom) DO NOTHING;

-- ------------------------------------------------------------
-- VOLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id),
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  compagnie_libelle TEXT NOT NULL,
  duree_minutes INTEGER NOT NULL,
  depart_utc TIMESTAMPTZ NOT NULL,
  arrivee_utc TIMESTAMPTZ NOT NULL,
  type_vol TEXT NOT NULL CHECK (type_vol IN ('IFR', 'VFR')),
  commandant_bord TEXT NOT NULL,
  role_pilote TEXT NOT NULL CHECK (role_pilote IN ('Pilote', 'Co-pilote')),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validé', 'refusé')),
  refusal_count INTEGER NOT NULL DEFAULT 0,
  refusal_reason TEXT,
  editing_by_pilot_id UUID,
  editing_started_at TIMESTAMPTZ,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vols_pilote ON public.vols(pilote_id);
CREATE INDEX idx_vols_statut ON public.vols(statut);

-- ------------------------------------------------------------
-- DOCUMENT SECTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- DOCUMENT FILES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.document_sections(id) ON DELETE CASCADE,
  nom_original TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  taille_bytes BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- VOLS ARCHIVE (comptes supprimés, purge J+7)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vols_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilote_id_deleted UUID NOT NULL,
  type_avion_nom TEXT,
  compagnie_libelle TEXT,
  duree_minutes INTEGER,
  depart_utc TIMESTAMPTZ,
  arrivee_utc TIMESTAMPTZ,
  type_vol TEXT,
  commandant_bord TEXT,
  role_pilote TEXT,
  purge_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.types_avion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

-- Fonction helper: est admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: lecture pour tous connectés, écriture admin ou soi-même (champs limités)
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin());

-- COMPAGNIES: lecture tous, CRUD admin
CREATE POLICY "compagnies_select" ON public.compagnies FOR SELECT TO authenticated USING (true);
CREATE POLICY "compagnies_all_admin" ON public.compagnies FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- TYPES_AVION: lecture tous, CRUD admin
CREATE POLICY "types_avion_select" ON public.types_avion FOR SELECT TO authenticated USING (true);
CREATE POLICY "types_avion_all_admin" ON public.types_avion FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- VOLS: pilote voit les siens, admin voit tout; insert pilote ou admin; update selon rôle
CREATE POLICY "vols_select_own" ON public.vols FOR SELECT TO authenticated
  USING (pilote_id = auth.uid());
CREATE POLICY "vols_select_admin" ON public.vols FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "vols_insert" ON public.vols FOR INSERT TO authenticated
  WITH CHECK (pilote_id = auth.uid() OR public.is_admin());
CREATE POLICY "vols_update_own" ON public.vols FOR UPDATE TO authenticated
  USING (pilote_id = auth.uid() AND statut IN ('en_attente', 'refusé'))
  WITH CHECK (pilote_id = auth.uid());
CREATE POLICY "vols_update_admin" ON public.vols FOR UPDATE TO authenticated
  USING (public.is_admin());
CREATE POLICY "vols_delete_admin" ON public.vols FOR DELETE TO authenticated
  USING (public.is_admin());

-- DOCUMENT_SECTIONS: lecture tous, CRUD admin
CREATE POLICY "doc_sections_select" ON public.document_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "doc_sections_all_admin" ON public.document_sections FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- DOCUMENT_FILES: lecture tous, CRUD admin
CREATE POLICY "doc_files_select" ON public.document_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "doc_files_all_admin" ON public.document_files FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Trigger updated_at pour profiles, vols, document_sections
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vols_updated_at BEFORE UPDATE ON public.vols
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER document_sections_updated_at BEFORE UPDATE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
