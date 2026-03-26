-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  WEBLOGBOOK — TOUTES LES MIGRATIONS (FICHIER UNIQUE)                     ║
-- ║  Dernière mise à jour : 26 mars 2026                                     ║
-- ║  Idempotent : peut être relancé sans risque (IF NOT EXISTS partout)       ║
-- ║  Exécuter dans l'éditeur SQL Supabase en une ou plusieurs parties.       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- ORDRE D'EXÉCUTION :
--   Phase 0  : Schéma de base (profiles, compagnies, types_avion, vols, documents)
--   Phase 1  : Extensions vols & profiles
--   Phase 2  : Espace ATC (grades, sessions, plans_vol, notams, licences)
--   Phase 3  : Felitz Bank (comptes, transactions, virements, inventaire, taxes)
--   Phase 4  : Gestion compagnies (employés, hubs, flotte, avions, ferry, locations)
--   Phase 5  : Alliances
--   Phase 6  : Entreprises de réparation
--   Phase 7  : SIAVI / AFIS
--   Phase 8  : IFSA (recrutement, sanctions, autorisations)
--   Phase 9  : Sécurité (login, email, superadmin, reset password)
--   Phase 10 : Systèmes annexes (ATIS, cartes identité, ATC calls, aeroschool, etc.)
--   Phase 11 : Hangar Market & Marketplace
--   Phase 12 : Incidents de vol
--   Phase 13 : Armée / Militaire
--   Phase 14 : Optimisation (index)
--   Phase 15 : Données de base (seed)


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 0 : SCHÉMA DE BASE
-- Source : schema.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identifiant TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'pilote',
  heures_initiales_minutes INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compagnies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.types_avion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  constructeur TEXT DEFAULT '',
  ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID REFERENCES public.types_avion(id),
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  compagnie_libelle TEXT NOT NULL,
  duree_minutes INTEGER NOT NULL,
  depart_utc TIMESTAMPTZ NOT NULL,
  arrivee_utc TIMESTAMPTZ NOT NULL,
  type_vol TEXT NOT NULL,
  commandant_bord TEXT NOT NULL,
  role_pilote TEXT NOT NULL CHECK (role_pilote IN ('Pilote', 'Co-pilote')),
  statut TEXT NOT NULL DEFAULT 'en_attente',
  refusal_count INTEGER NOT NULL DEFAULT 0,
  refusal_reason TEXT,
  editing_by_pilot_id UUID,
  editing_started_at TIMESTAMPTZ,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vols_pilote ON public.vols(pilote_id);
CREATE INDEX IF NOT EXISTS idx_vols_statut ON public.vols(statut);

CREATE TABLE IF NOT EXISTS public.document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.document_sections(id) ON DELETE CASCADE,
  nom_original TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  taille_bytes BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- RLS de base
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.types_avion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- Policies Phase 0 (DROP IF EXISTS pour idempotence)
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
  CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
  CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
  CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin());

  DROP POLICY IF EXISTS "compagnies_select" ON public.compagnies;
  CREATE POLICY "compagnies_select" ON public.compagnies FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "compagnies_all_admin" ON public.compagnies;
  CREATE POLICY "compagnies_all_admin" ON public.compagnies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "types_avion_select" ON public.types_avion;
  CREATE POLICY "types_avion_select" ON public.types_avion FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "types_avion_all_admin" ON public.types_avion;
  CREATE POLICY "types_avion_all_admin" ON public.types_avion FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "vols_select_own" ON public.vols;
  CREATE POLICY "vols_select_own" ON public.vols FOR SELECT TO authenticated USING (pilote_id = auth.uid());
  DROP POLICY IF EXISTS "vols_select_admin" ON public.vols;
  CREATE POLICY "vols_select_admin" ON public.vols FOR SELECT TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "vols_insert" ON public.vols;
  CREATE POLICY "vols_insert" ON public.vols FOR INSERT TO authenticated WITH CHECK (pilote_id = auth.uid() OR public.is_admin());
  DROP POLICY IF EXISTS "vols_update_own" ON public.vols;
  CREATE POLICY "vols_update_own" ON public.vols FOR UPDATE TO authenticated USING (pilote_id = auth.uid() AND statut IN ('en_attente', 'refusé')) WITH CHECK (pilote_id = auth.uid());
  DROP POLICY IF EXISTS "vols_update_admin" ON public.vols;
  CREATE POLICY "vols_update_admin" ON public.vols FOR UPDATE TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "vols_delete_admin" ON public.vols;
  CREATE POLICY "vols_delete_admin" ON public.vols FOR DELETE TO authenticated USING (public.is_admin());

  DROP POLICY IF EXISTS "doc_sections_select" ON public.document_sections;
  CREATE POLICY "doc_sections_select" ON public.document_sections FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "doc_sections_all_admin" ON public.document_sections;
  CREATE POLICY "doc_sections_all_admin" ON public.document_sections FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  DROP POLICY IF EXISTS "doc_files_select" ON public.document_files;
  CREATE POLICY "doc_files_select" ON public.document_files FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "doc_files_all_admin" ON public.document_files;
  CREATE POLICY "doc_files_all_admin" ON public.document_files FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
END $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS vols_updated_at ON public.vols;
CREATE TRIGGER vols_updated_at BEFORE UPDATE ON public.vols FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS document_sections_updated_at ON public.document_sections;
CREATE TRIGGER document_sections_updated_at BEFORE UPDATE ON public.document_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 1 : EXTENSIONS VOLS & PROFILES
-- Sources : MIGRATIONS_COMPLETES.sql, MIGRATIONS_ESSENTIELLES.sql, add_*.sql
-- ████████████████████████████████████████████████████████████████████████████

-- Contraintes rôle (version finale avec tous les rôles)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa', 'siavi'));

-- Colonnes profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS callsign TEXT,
  ADD COLUMN IF NOT EXISTS armee BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atc BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ifsa BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS siavi BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atc_grade_id UUID,
  ADD COLUMN IF NOT EXISTS atc_temps_total_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atis_ticker_visible BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS atis_code_auto_rotate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sanction_blocage_vol BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sanction_blocage_motif TEXT,
  ADD COLUMN IF NOT EXISTS sanction_blocage_jusqu_au TIMESTAMPTZ;

-- Contraintes vols
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction', 'Vol militaire'));

ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_statut_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_statut_check
  CHECK (statut IN ('en_attente', 'validé', 'refusé', 'annulé',
    'en_attente_confirmation_pilote', 'en_attente_confirmation_copilote',
    'refuse_par_copilote', 'en_attente_confirmation_instructeur'));

ALTER TABLE public.vols ALTER COLUMN type_avion_id DROP NOT NULL;

-- Colonnes vols
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS aeroport_depart TEXT,
  ADD COLUMN IF NOT EXISTS aeroport_arrivee TEXT,
  ADD COLUMN IF NOT EXISTS copilote_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copilote_confirme_par_pilote BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instructeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instruction_type TEXT,
  ADD COLUMN IF NOT EXISTS callsign TEXT,
  ADD COLUMN IF NOT EXISTS type_avion_militaire TEXT,
  ADD COLUMN IF NOT EXISTS escadrille_ou_escadron TEXT,
  ADD COLUMN IF NOT EXISTS chef_escadron_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nature_vol_militaire TEXT,
  ADD COLUMN IF NOT EXISTS nature_vol_militaire_autre TEXT,
  ADD COLUMN IF NOT EXISTS armee_avion_id UUID,
  ADD COLUMN IF NOT EXISTS mission_id TEXT,
  ADD COLUMN IF NOT EXISTS mission_titre TEXT,
  ADD COLUMN IF NOT EXISTS mission_reward_base INTEGER,
  ADD COLUMN IF NOT EXISTS mission_reward_final INTEGER,
  ADD COLUMN IF NOT EXISTS mission_delay_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS mission_status TEXT,
  ADD COLUMN IF NOT EXISTS mission_refusals INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heure_depart_reelle TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avion_detruit BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vols_copilote ON public.vols(copilote_id);

DROP POLICY IF EXISTS "vols_select_copilote" ON public.vols;
CREATE POLICY "vols_select_copilote" ON public.vols FOR SELECT TO authenticated USING (copilote_id = auth.uid());

-- Compagnies : colonnes supplémentaires
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS pdg_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code_oaci TEXT,
  ADD COLUMN IF NOT EXISTS prix_billet_pax INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS prix_kg_cargo INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pourcentage_salaire INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS vban TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS alliance_id UUID,
  ADD COLUMN IF NOT EXISTS dernier_changement_principal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_compagnies_pdg_id ON public.compagnies(pdg_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_nom ON public.compagnies(nom);

DROP TRIGGER IF EXISTS compagnies_updated_at ON public.compagnies;
CREATE TRIGGER compagnies_updated_at BEFORE UPDATE ON public.compagnies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Types avion : colonnes prix/capacité
ALTER TABLE public.types_avion
  ADD COLUMN IF NOT EXISTS prix INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_pax INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_cargo_kg INTEGER NOT NULL DEFAULT 0;

-- Équipage militaire
CREATE TABLE IF NOT EXISTS public.vols_equipage_militaire (
  vol_id UUID NOT NULL REFERENCES public.vols(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (vol_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_vols_equipage_militaire_profile ON public.vols_equipage_militaire(profile_id);


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 2 : ESPACE ATC
-- Sources : MIGRATIONS_COMPLETES.sql, add_flight_strips.sql, add_plans_vol_*.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.atc_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  statut TEXT NOT NULL DEFAULT 'depose',
  refusal_reason TEXT,
  instructions TEXT,
  current_holder_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_holder_position TEXT,
  current_holder_aeroport TEXT,
  automonitoring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut IN (
  'depose', 'en_attente', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture'
));

-- Colonnes plans_vol supplémentaires
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS vol_commercial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_ifr TEXT,
  ADD COLUMN IF NOT EXISTS note_atc TEXT,
  ADD COLUMN IF NOT EXISTS nature_transport TEXT,
  ADD COLUMN IF NOT EXISTS nb_pax_genere INTEGER,
  ADD COLUMN IF NOT EXISTS cargo_kg_genere INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_brut INTEGER,
  ADD COLUMN IF NOT EXISTS taxes_montant INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_net INTEGER,
  ADD COLUMN IF NOT EXISTS salaire_pilote INTEGER,
  ADD COLUMN IF NOT EXISTS inventaire_avion_id UUID,
  ADD COLUMN IF NOT EXISTS flotte_avion_id UUID,
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID,
  ADD COLUMN IF NOT EXISTS vol_ferry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloture_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloture_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prix_billet_utilise INTEGER,
  ADD COLUMN IF NOT EXISTS vol_sans_atc BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demande_cloture_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bria_conversation JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pending_transfer_aeroport TEXT,
  ADD COLUMN IF NOT EXISTS pending_transfer_position TEXT,
  ADD COLUMN IF NOT EXISTS pending_transfer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_id UUID,
  ADD COLUMN IF NOT EXISTS location_loueur_compagnie_id UUID,
  ADD COLUMN IF NOT EXISTS location_pourcentage_revenu_loueur INTEGER,
  ADD COLUMN IF NOT EXISTS location_prix_journalier INTEGER,
  ADD COLUMN IF NOT EXISTS type_cargaison TEXT,
  ADD COLUMN IF NOT EXISTS type_cargaison_libelle TEXT,
  ADD COLUMN IF NOT EXISTS marchandise_rare BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS niveau_croisiere TEXT;

-- Flight strips
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS strip_atd TEXT,
  ADD COLUMN IF NOT EXISTS strip_rwy TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl_unit TEXT DEFAULT 'FL',
  ADD COLUMN IF NOT EXISTS strip_sid_atc TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_1 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_2 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_3 TEXT,
  ADD COLUMN IF NOT EXISTS strip_zone TEXT,
  ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strip_star TEXT,
  ADD COLUMN IF NOT EXISTS strip_route TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_vol_pilote ON public.plans_vol(pilote_id);
CREATE INDEX IF NOT EXISTS idx_plans_vol_statut ON public.plans_vol(statut);
CREATE INDEX IF NOT EXISTS idx_plans_vol_holder ON public.plans_vol(current_holder_user_id);
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol(strip_zone, strip_order);
CREATE INDEX IF NOT EXISTS idx_plans_vol_pending ON public.plans_vol(pending_transfer_aeroport, pending_transfer_position) WHERE pending_transfer_aeroport IS NOT NULL;

-- RLS ATC
ALTER TABLE public.atc_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atc_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans_vol ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "atc_grades_select" ON public.atc_grades;
  CREATE POLICY "atc_grades_select" ON public.atc_grades FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "atc_grades_all_admin" ON public.atc_grades;
  CREATE POLICY "atc_grades_all_admin" ON public.atc_grades FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "atc_sessions_select" ON public.atc_sessions;
  CREATE POLICY "atc_sessions_select" ON public.atc_sessions FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "atc_sessions_insert" ON public.atc_sessions;
  CREATE POLICY "atc_sessions_insert" ON public.atc_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  DROP POLICY IF EXISTS "atc_sessions_update" ON public.atc_sessions;
  CREATE POLICY "atc_sessions_update" ON public.atc_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "atc_sessions_delete" ON public.atc_sessions;
  CREATE POLICY "atc_sessions_delete" ON public.atc_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "plans_vol_select_pilote" ON public.plans_vol;
  CREATE POLICY "plans_vol_select_pilote" ON public.plans_vol FOR SELECT TO authenticated USING (pilote_id = auth.uid());
  DROP POLICY IF EXISTS "plans_vol_select_holder" ON public.plans_vol;
  CREATE POLICY "plans_vol_select_holder" ON public.plans_vol FOR SELECT TO authenticated USING (current_holder_user_id = auth.uid());
  DROP POLICY IF EXISTS "plans_vol_select_admin" ON public.plans_vol;
  CREATE POLICY "plans_vol_select_admin" ON public.plans_vol FOR SELECT TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "plans_vol_select_atc" ON public.plans_vol;
  CREATE POLICY "plans_vol_select_atc" ON public.plans_vol FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (atc = true OR role = 'admin')));
  DROP POLICY IF EXISTS "plans_vol_insert" ON public.plans_vol;
  CREATE POLICY "plans_vol_insert" ON public.plans_vol FOR INSERT TO authenticated WITH CHECK (pilote_id = auth.uid());
  DROP POLICY IF EXISTS "plans_vol_update" ON public.plans_vol;
  CREATE POLICY "plans_vol_update" ON public.plans_vol FOR UPDATE TO authenticated USING (pilote_id = auth.uid() OR current_holder_user_id = auth.uid() OR public.is_admin());
END $$;

DROP TRIGGER IF EXISTS plans_vol_updated_at ON public.plans_vol;
CREATE TRIGGER plans_vol_updated_at BEFORE UPDATE ON public.plans_vol FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTAMs
CREATE TABLE IF NOT EXISTS public.notams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant TEXT NOT NULL UNIQUE,
  code_aeroport TEXT NOT NULL,
  du_at TIMESTAMPTZ NOT NULL,
  au_at TIMESTAMPTZ NOT NULL,
  champ_a TEXT,
  champ_e TEXT NOT NULL,
  champ_d TEXT,
  champ_q TEXT,
  priorite TEXT,
  reference_fr TEXT,
  annule BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notams_au_at ON public.notams(au_at DESC);
ALTER TABLE public.notams ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "notams_select_authenticated" ON public.notams;
  CREATE POLICY "notams_select_authenticated" ON public.notams FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "notams_insert_admin" ON public.notams;
  CREATE POLICY "notams_insert_admin" ON public.notams FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  DROP POLICY IF EXISTS "notams_update_admin" ON public.notams;
  CREATE POLICY "notams_update_admin" ON public.notams FOR UPDATE TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "notams_delete_admin" ON public.notams;
  CREATE POLICY "notams_delete_admin" ON public.notams FOR DELETE TO authenticated USING (public.is_admin());
END $$;

-- Licences et qualifications
CREATE TABLE IF NOT EXISTS public.licences_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  type_avion_id UUID REFERENCES public.types_avion(id) ON DELETE SET NULL,
  langue TEXT,
  date_delivrance DATE,
  date_expiration DATE,
  a_vie BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_licences_user ON public.licences_qualifications(user_id);
ALTER TABLE public.licences_qualifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "licences_select_self" ON public.licences_qualifications;
  CREATE POLICY "licences_select_self" ON public.licences_qualifications FOR SELECT TO authenticated USING (user_id = auth.uid());
  DROP POLICY IF EXISTS "licences_select_admin" ON public.licences_qualifications;
  CREATE POLICY "licences_select_admin" ON public.licences_qualifications FOR SELECT TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "licences_insert_admin" ON public.licences_qualifications;
  CREATE POLICY "licences_insert_admin" ON public.licences_qualifications FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  DROP POLICY IF EXISTS "licences_update_admin" ON public.licences_qualifications;
  CREATE POLICY "licences_update_admin" ON public.licences_qualifications FOR UPDATE TO authenticated USING (public.is_admin());
  DROP POLICY IF EXISTS "licences_delete_admin" ON public.licences_qualifications;
  CREATE POLICY "licences_delete_admin" ON public.licences_qualifications FOR DELETE TO authenticated USING (public.is_admin());
END $$;

-- ATC taxes & salaires
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

CREATE TABLE IF NOT EXISTS public.atc_taxes_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.atc_sessions(id) ON DELETE CASCADE,
  plan_vol_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL,
  montant INTEGER NOT NULL DEFAULT 0,
  aeroport TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_atc_taxes_pending_user ON public.atc_taxes_pending(user_id);
ALTER TABLE public.atc_plans_controles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atc_taxes_pending ENABLE ROW LEVEL SECURITY;

-- SID/STAR
CREATE TABLE IF NOT EXISTS public.sid_star_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport_code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SID', 'STAR')),
  nom TEXT NOT NULL,
  piste TEXT,
  description TEXT,
  waypoints JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(aeroport_code, type, nom)
);
CREATE INDEX IF NOT EXISTS idx_sid_star_aeroport ON public.sid_star_procedures(aeroport_code, type);

-- VHF Frequencies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vhf_position_frequencies') THEN
    CREATE TABLE public.vhf_position_frequencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aeroport TEXT NOT NULL,
      position TEXT NOT NULL,
      frequency TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(aeroport, position),
      UNIQUE(frequency)
    );
    ALTER TABLE public.vhf_position_frequencies ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vhf_freq_select" ON public.vhf_position_frequencies FOR SELECT TO authenticated USING (true);
    CREATE POLICY "vhf_freq_admin" ON public.vhf_position_frequencies FOR ALL USING (public.is_admin());
  END IF;
END $$;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 3 : FELITZ BANK
-- Source : MIGRATION_FELITZ_COMPLETE.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.compagnie_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_embauche TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, pilote_id)
);
ALTER TABLE public.compagnie_employes ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employe';
CREATE INDEX IF NOT EXISTS idx_compagnie_employes_compagnie ON public.compagnie_employes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnie_employes_pilote ON public.compagnie_employes(pilote_id);

CREATE TABLE IF NOT EXISTS public.felitz_comptes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  proprietaire_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  vban TEXT NOT NULL UNIQUE,
  solde INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.felitz_comptes
  ADD COLUMN IF NOT EXISTS alliance_id UUID,
  ADD COLUMN IF NOT EXISTS entreprise_reparation_id UUID;
DO $$ BEGIN
  ALTER TABLE public.felitz_comptes DROP CONSTRAINT IF EXISTS felitz_comptes_type_check;
  ALTER TABLE public.felitz_comptes ADD CONSTRAINT felitz_comptes_type_check
    CHECK (type IN ('personnel', 'entreprise', 'militaire', 'alliance', 'reparation'));
END $$;
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_proprietaire ON public.felitz_comptes(proprietaire_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_compagnie ON public.felitz_comptes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_vban ON public.felitz_comptes(vban);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_reparation ON public.felitz_comptes(entreprise_reparation_id);

CREATE TABLE IF NOT EXISTS public.felitz_virements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_source_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  compte_dest_vban TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.felitz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_felitz_transactions_date ON public.felitz_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventaire_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietaire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  nom_personnalise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventaire_avions ADD COLUMN IF NOT EXISTS immatriculation TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS public.compagnie_flotte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  nom_personnalise TEXT,
  capacite_pax_custom INTEGER,
  capacite_cargo_custom INTEGER,
  UNIQUE(compagnie_id, type_avion_id)
);

CREATE TABLE IF NOT EXISTS public.taxes_aeroport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  taxe_pourcent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  taxe_vfr_pourcent NUMERIC(5,2) NOT NULL DEFAULT 5.00
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinataire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type_message TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS expediteur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cheque_montant INTEGER,
  ADD COLUMN IF NOT EXISTS cheque_compte_dest_id UUID,
  ADD COLUMN IF NOT EXISTS cheque_encaisse BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cheque_encaisse_at TIMESTAMPTZ;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check CHECK (type_message IN (
  'normal', 'cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc',
  'recrutement', 'sanction_ifsa', 'amende_ifsa', 'relance_amende',
  'location_avion', 'cheque_siavi_intervention', 'cheque_siavi_taxes',
  'systeme', 'alerte_connexion'
));
CREATE INDEX IF NOT EXISTS idx_messages_destinataire ON public.messages(destinataire_id);

-- RLS Felitz (voir MIGRATION_FELITZ_COMPLETE.sql pour détails)
ALTER TABLE public.compagnie_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_virements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnie_flotte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxes_aeroport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Fonctions Felitz
CREATE OR REPLACE FUNCTION generate_vban(prefix TEXT DEFAULT 'MIXOU') RETURNS TEXT AS $$
DECLARE result TEXT; chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; i INTEGER;
BEGIN
  result := prefix;
  FOR i IN 1..22 LOOP result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1); END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_personal_felitz_account() RETURNS TRIGGER AS $$
DECLARE new_vban TEXT;
BEGIN
  LOOP new_vban := generate_vban('MIXOU'); EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = new_vban); END LOOP;
  INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde) VALUES ('personnel', NEW.id, new_vban, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_felitz_account_on_profile ON public.profiles;
CREATE TRIGGER create_felitz_account_on_profile AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION create_personal_felitz_account();

CREATE OR REPLACE FUNCTION create_company_felitz_account() RETURNS TRIGGER AS $$
DECLARE new_vban TEXT;
BEGIN
  IF NEW.vban IS NULL THEN
    LOOP new_vban := generate_vban('ENTERMIXOU'); EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = new_vban) AND NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = new_vban); END LOOP;
    NEW.vban := new_vban;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_company_vban ON public.compagnies;
CREATE TRIGGER set_company_vban BEFORE INSERT ON public.compagnies FOR EACH ROW EXECUTE FUNCTION create_company_felitz_account();

CREATE OR REPLACE FUNCTION create_company_felitz_account_after() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE compagnie_id = NEW.id AND type = 'entreprise') THEN
    INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde) VALUES ('entreprise', NEW.id, NEW.vban, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_felitz_account_on_compagnie ON public.compagnies;
CREATE TRIGGER create_felitz_account_on_compagnie AFTER INSERT ON public.compagnies FOR EACH ROW EXECUTE FUNCTION create_company_felitz_account_after();

-- Fonctions atomiques débit/crédit
CREATE OR REPLACE FUNCTION public.debiter_compte_safe(p_compte_id UUID, p_montant BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.felitz_comptes SET solde = solde - p_montant WHERE id = p_compte_id AND solde >= p_montant; RETURN FOUND; END; $$;

CREATE OR REPLACE FUNCTION public.crediter_compte_safe(p_compte_id UUID, p_montant BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.felitz_comptes SET solde = solde + p_montant WHERE id = p_compte_id; RETURN FOUND; END; $$;

-- Prêts bancaires
CREATE TABLE IF NOT EXISTS public.prets_bancaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  montant_initial INTEGER NOT NULL CHECK (montant_initial > 0),
  montant_restant INTEGER NOT NULL DEFAULT 0,
  taux_interet NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  mensualite INTEGER NOT NULL,
  nb_mensualites_total INTEGER NOT NULL,
  nb_mensualites_payees INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'rembourse', 'defaut')),
  prochaine_echeance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prets_bancaires ADD COLUMN IF NOT EXISTS rembourse_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_prets_bancaires_compte ON public.prets_bancaires(compte_id);


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 4 : GESTION COMPAGNIES (hubs, flotte individuelle, ferry, locations)
-- Sources : add_compagnie_gestion.sql, MIGRATION_COMPLETE_FLOTTE.sql, add_compagnie_locations.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.compagnie_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  code_oaci TEXT NOT NULL,
  nom TEXT,
  principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compagnie_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE RESTRICT,
  immatriculation TEXT NOT NULL UNIQUE,
  nom_bapteme TEXT,
  aeroport_actuel TEXT,
  statut TEXT NOT NULL DEFAULT 'disponible' CHECK (statut IN ('disponible', 'en_vol', 'en_maintenance', 'en_transit', 'en_location', 'en_reparation', 'detruit')),
  usure_percent INTEGER NOT NULL DEFAULT 0 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  prix_achat INTEGER NOT NULL DEFAULT 0,
  achete_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compagnie_avions
  ADD COLUMN IF NOT EXISTS maintenance_fin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bloque_incident BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incident_id UUID,
  ADD COLUMN IF NOT EXISTS maintenance_delay_hours INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.vols_ferry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  aeroport_depart TEXT NOT NULL,
  aeroport_arrivee TEXT NOT NULL,
  pilote_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'complete', 'annule')),
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Locations d'avions
CREATE TABLE IF NOT EXISTS public.compagnie_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  loueur_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  locataire_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  prix_journalier INTEGER NOT NULL,
  pourcentage_revenu_loueur INTEGER NOT NULL,
  duree_jours INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  last_billed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT
);

-- Tarifs liaisons
CREATE TABLE IF NOT EXISTS public.tarifs_liaisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  aeroport_depart TEXT NOT NULL,
  aeroport_arrivee TEXT NOT NULL,
  prix_billet INTEGER NOT NULL DEFAULT 100,
  bidirectionnel BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, aeroport_depart, aeroport_arrivee)
);

CREATE TABLE IF NOT EXISTS public.aeroport_passagers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  passagers_disponibles INTEGER NOT NULL DEFAULT 10000,
  passagers_max INTEGER NOT NULL DEFAULT 10000,
  derniere_regeneration TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 5 : ALLIANCES
-- Source : MIGRATION_ALLIANCES_REPARATION.sql (Phase 1)
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.alliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  created_by_compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  description TEXT,
  logo_url TEXT,
  devise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alliance_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'membre' CHECK (role IN ('president', 'vice_president', 'secretaire', 'membre')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(alliance_id, compagnie_id)
);
ALTER TABLE public.alliance_membres ADD COLUMN IF NOT EXISTS codeshare_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.alliance_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  invite_par_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.alliance_parametres (
  alliance_id UUID PRIMARY KEY REFERENCES public.alliances(id) ON DELETE CASCADE,
  codeshare_actif BOOLEAN NOT NULL DEFAULT false,
  codeshare_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxe_alliance_actif BOOLEAN NOT NULL DEFAULT false,
  taxe_alliance_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0,
  transfert_avions_actif BOOLEAN NOT NULL DEFAULT false,
  pret_avions_actif BOOLEAN NOT NULL DEFAULT false,
  don_avions_actif BOOLEAN NOT NULL DEFAULT false,
  partage_hubs_actif BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alliance_annonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  important BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alliance_transferts_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  type_transfert TEXT NOT NULL CHECK (type_transfert IN ('vente', 'don', 'pret')),
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  compagnie_source_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  compagnie_dest_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  prix INTEGER CHECK (prix IS NULL OR prix >= 0),
  duree_jours INTEGER,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);
ALTER TABLE public.alliance_transferts_avions DROP CONSTRAINT IF EXISTS alliance_transferts_avions_statut_check;
ALTER TABLE public.alliance_transferts_avions ADD CONSTRAINT alliance_transferts_avions_statut_check
  CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'complete', 'retourne', 'annule'));

CREATE TABLE IF NOT EXISTS public.alliance_demandes_fonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL CHECK (montant > 0),
  motif TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
  traite_par UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.alliance_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_transferts_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_demandes_fonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_contributions ENABLE ROW LEVEL SECURITY;

-- Fonctions alliances (voir MIGRATION_ALLIANCES_REPARATION.sql pour le détail)
CREATE OR REPLACE FUNCTION public.alliance_creer(p_nom TEXT, p_compagnie_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pdg_id UUID; v_alliance_id UUID; v_vban TEXT;
BEGIN
  IF p_nom IS NULL OR trim(p_nom) = '' THEN RAISE EXCEPTION 'Le nom de l''alliance est requis'; END IF;
  SELECT pdg_id INTO v_pdg_id FROM public.compagnies WHERE id = p_compagnie_id;
  IF v_pdg_id IS NULL OR v_pdg_id != auth.uid() THEN RAISE EXCEPTION 'Seul le PDG peut créer une alliance'; END IF;
  IF EXISTS (SELECT 1 FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id) THEN RAISE EXCEPTION 'Cette compagnie fait déjà partie d''une alliance'; END IF;
  INSERT INTO public.alliances (nom, created_by_compagnie_id) VALUES (trim(p_nom), p_compagnie_id) RETURNING id INTO v_alliance_id;
  INSERT INTO public.alliance_membres (alliance_id, compagnie_id, role, invited_by) VALUES (v_alliance_id, p_compagnie_id, 'president', v_pdg_id);
  INSERT INTO public.alliance_parametres (alliance_id) VALUES (v_alliance_id);
  UPDATE public.compagnies SET alliance_id = v_alliance_id WHERE id = p_compagnie_id;
  LOOP v_vban := 'MIXALLIANCE' || upper(substr(md5(random()::text || v_alliance_id::text), 1, 16)); EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = v_vban); END LOOP;
  INSERT INTO public.felitz_comptes (type, alliance_id, vban, solde) VALUES ('alliance', v_alliance_id, v_vban, 0);
  RETURN v_alliance_id;
END; $$;

CREATE OR REPLACE FUNCTION public.alliance_quitter(p_compagnie_id UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alliance_id UUID; v_membres_restants INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.compagnies WHERE id = p_compagnie_id AND pdg_id = auth.uid()) THEN RAISE EXCEPTION 'Seul le PDG peut faire quitter l''alliance'; END IF;
  SELECT alliance_id INTO v_alliance_id FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id;
  IF v_alliance_id IS NULL THEN RAISE EXCEPTION 'Pas dans une alliance'; END IF;
  DELETE FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND compagnie_id = p_compagnie_id;
  UPDATE public.compagnies SET alliance_id = NULL WHERE id = p_compagnie_id;
  SELECT count(*) INTO v_membres_restants FROM public.alliance_membres WHERE alliance_id = v_alliance_id;
  IF v_membres_restants = 0 THEN DELETE FROM public.alliances WHERE id = v_alliance_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND role = 'president') THEN
      UPDATE public.alliance_membres SET role = 'president' WHERE id = (SELECT id FROM public.alliance_membres WHERE alliance_id = v_alliance_id ORDER BY joined_at ASC LIMIT 1);
    END IF;
  END IF;
END; $$;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 6 : ENTREPRISES DE RÉPARATION
-- Sources : MIGRATION_ALLIANCES_REPARATION.sql (Phase 2), migration_reparation_hangars_payants_parametres.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.entreprises_reparation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  pdg_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.entreprises_reparation
  ADD COLUMN IF NOT EXISTS prix_hangar_base INTEGER NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS prix_hangar_multiplicateur INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS alliance_reparation_actif BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alliance_id UUID REFERENCES public.alliances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prix_alliance_pourcent INTEGER NOT NULL DEFAULT 80;

CREATE TABLE IF NOT EXISTS public.reparation_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'technicien' CHECK (role IN ('pdg', 'technicien', 'logistique')),
  specialite TEXT,
  date_embauche TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reparation_hangars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  aeroport_code TEXT NOT NULL,
  nom TEXT,
  capacite INTEGER NOT NULL DEFAULT 2 CHECK (capacite >= 1 AND capacite <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, aeroport_code)
);
ALTER TABLE public.reparation_hangars
  ADD COLUMN IF NOT EXISTS prix_achat INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS achat_le TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.reparation_tarifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  type_avion_id UUID REFERENCES public.types_avion(id) ON DELETE CASCADE,
  prix_par_point INTEGER NOT NULL DEFAULT 1000,
  duree_estimee_par_point INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, type_avion_id)
);

CREATE TABLE IF NOT EXISTS public.reparation_demandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  hangar_id UUID NOT NULL REFERENCES public.reparation_hangars(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'demandee',
  usure_avant INTEGER,
  usure_apres INTEGER,
  prix_total INTEGER,
  score_qualite INTEGER,
  commentaire_entreprise TEXT,
  commentaire_compagnie TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acceptee_at TIMESTAMPTZ,
  debut_reparation_at TIMESTAMPTZ,
  fin_reparation_at TIMESTAMPTZ,
  facturee_at TIMESTAMPTZ,
  payee_at TIMESTAMPTZ,
  completee_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.reparation_mini_jeux_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.reparation_demandes(id) ON DELETE CASCADE,
  type_jeu TEXT NOT NULL CHECK (type_jeu IN ('inspection', 'calibrage', 'assemblage', 'test_moteur')),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  duree_secondes INTEGER NOT NULL CHECK (duree_secondes > 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(demande_id, type_jeu)
);

ALTER TABLE public.entreprises_reparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_hangars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_mini_jeux_scores ENABLE ROW LEVEL SECURITY;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 7 : SIAVI / AFIS
-- Source : add_siavi_system.sql
-- ████████████████████████████████████████████████████████████████████████████
-- Note : exécuter supabase/add_siavi_system.sql séparément pour le détail complet.
-- Tables principales : afis_aeroports, afis_sessions, afis_grades, afis_interventions


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 8 : IFSA (recrutement, sanctions, autorisations)
-- Sources : add_recrutement_ifsa_system.sql, add_sanctions_system.sql, add_autorisations_exploitation.sql
-- ████████████████████████████████████████████████████████████████████████████
-- Note : exécuter ces fichiers séparément pour le détail complet.
-- Tables : ifsa_signalements, ifsa_sanctions, ifsa_paiements_amendes, autorisations_exploitation


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 9 : SÉCURITÉ
-- Source : MIGRATIONS_SECURITE_TOUT_EN_UN.sql, MIGRATIONS_CHECKUP_COMPLET.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.login_verification_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_verification_codes ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE public.login_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  login_admin_only BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.site_config (id, login_admin_only) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "site_config_select" ON public.site_config;
  CREATE POLICY "site_config_select" ON public.site_config FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "site_config_update_admin" ON public.site_config;
  CREATE POLICY "site_config_update_admin" ON public.site_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
END $$;

CREATE TABLE IF NOT EXISTS public.login_ip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_ip_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant_or_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.deletion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB
);
ALTER TABLE public.deletion_logs ENABLE ROW LEVEL SECURITY;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 10 : SYSTÈMES ANNEXES
-- ████████████████████████████████████████████████████████████████████████████

-- ATC Calls
CREATE TABLE IF NOT EXISTS public.atc_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_aeroport TEXT NOT NULL,
  from_position TEXT NOT NULL,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_aeroport TEXT NOT NULL,
  to_position TEXT NOT NULL,
  number_dialed TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ringing', 'connected', 'ended', 'rejected')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ATIS Broadcast
CREATE TABLE IF NOT EXISTS public.atis_broadcast_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  controlling_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aeroport TEXT,
  position TEXT,
  broadcasting BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.atis_broadcast_state (id, broadcasting) VALUES ('default', false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.atis_broadcast_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  discord_guild_id TEXT,
  discord_guild_name TEXT,
  discord_channel_id TEXT,
  discord_channel_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.atis_broadcast_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Cartes d'identité
-- Note : exécuter supabase/add_cartes_identite.sql et supabase/add_storage_cartes.sql séparément

-- AeroSchool
CREATE TABLE IF NOT EXISTS public.aeroschool_formulaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre TEXT NOT NULL,
  description TEXT,
  blocs JSONB NOT NULL DEFAULT '[]'::jsonb,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aeroschool_reponses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulaire_id UUID REFERENCES public.aeroschool_formulaires(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reponses JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_total INTEGER,
  score_max INTEGER,
  statut TEXT DEFAULT 'en_attente',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  commentaire_correcteur TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.aeroschool_formulaires
  ADD COLUMN IF NOT EXISTS temps_limite_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS anti_triche BOOLEAN DEFAULT false;
ALTER TABLE public.aeroschool_reponses
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temps_limite_minutes INTEGER;

CREATE TABLE IF NOT EXISTS public.aeroschool_question_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb
);


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 11 : HANGAR MARKET & MARKETPLACE
-- Sources : add_hangar_market.sql, add_hangar_market_vente_flotte.sql, MIGRATIONS_CHECKUP_COMPLET.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.hangar_market (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendeur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventaire_avion_id UUID REFERENCES public.inventaire_avions(id) ON DELETE SET NULL,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id),
  prix INTEGER NOT NULL CHECK (prix > 0),
  statut TEXT NOT NULL DEFAULT 'en_vente' CHECK (statut IN ('en_vente', 'vendu', 'retire')),
  acheteur_id UUID REFERENCES public.profiles(id),
  vendu_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hangar_market
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vente_pdg_seulement BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.hangar_market ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hangar_market_reventes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demandeur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventaire_avion_id UUID REFERENCES public.inventaire_avions(id) ON DELETE SET NULL,
  compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  type_avion_id UUID NOT NULL,
  prix_initial BIGINT NOT NULL,
  pourcentage_demande INT NOT NULL DEFAULT 50,
  montant_revente BIGINT NOT NULL,
  raison TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('approuvee', 'refusee', 'en_attente', 'executee')),
  admin_id UUID REFERENCES public.profiles(id),
  admin_commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ,
  execute_at TIMESTAMPTZ
);
ALTER TABLE public.hangar_market_reventes ENABLE ROW LEVEL SECURITY;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 12 : INCIDENTS DE VOL
-- Source : add_incidents_vol.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.incidents_vol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_incident TEXT UNIQUE NOT NULL,
  type_incident TEXT NOT NULL CHECK (type_incident IN ('crash', 'atterrissage_urgence')),
  plan_vol_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL,
  numero_vol TEXT,
  aeroport_depart TEXT,
  aeroport_arrivee TEXT,
  type_vol TEXT,
  aeroport_incident TEXT,
  compagnie_avion_id UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL,
  immatriculation TEXT,
  type_avion TEXT,
  usure_avant_incident INTEGER,
  pilote_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pilote_identifiant TEXT,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  signale_par_id UUID NOT NULL REFERENCES public.profiles(id),
  signale_par_identifiant TEXT,
  position_atc TEXT,
  screenshot_url TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_examen', 'clos')),
  decision TEXT CHECK (decision IN ('remis_en_etat', 'detruit', NULL)),
  decision_notes TEXT,
  examine_par_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  examine_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.incidents_vol ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION generate_incident_numero() RETURNS TEXT AS $$
DECLARE year_part TEXT; seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(SPLIT_PART(numero_incident, '-', 3), '-', 1) AS INTEGER)), 0) + 1 INTO seq_num
  FROM incidents_vol WHERE numero_incident LIKE 'INC-' || year_part || '-%';
  RETURN 'INC-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 13 : ARMÉE / MILITAIRE
-- Source : add_armee_avions_missions.sql
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.armee_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE RESTRICT,
  nom_personnalise TEXT,
  detruit BOOLEAN NOT NULL DEFAULT false,
  detruit_at TIMESTAMPTZ,
  detruit_raison TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.armee_missions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_armee_missions_log_user ON public.armee_missions_log(user_id, created_at DESC);


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 14 : OPTIMISATION INDEX
-- Source : OPTIMISATION_INDEX.sql (exécuter ce fichier séparément pour la version complète)
-- ████████████████████████████████████████████████████████████████████████████
-- Les index les plus importants sont déjà créés ci-dessus avec chaque table.
-- Pour l'optimisation complète, exécuter : supabase/OPTIMISATION_INDEX.sql


-- ████████████████████████████████████████████████████████████████████████████
-- PHASE 15 : DONNÉES DE BASE (SEED)
-- ████████████████████████████████████████████████████████████████████████████

-- Types d'avion
INSERT INTO public.types_avion (nom, constructeur, ordre) VALUES
  ('Cessna Caravane', 'Cessna', 1), ('ATR72', 'ATR', 2), ('E190', 'Embraer', 3),
  ('A220', 'Airbus', 4), ('A320', 'Airbus', 5), ('B737', 'Boeing', 6),
  ('B757', 'Boeing', 7), ('B727', 'Boeing', 8), ('B767', 'Boeing', 9),
  ('A330', 'Airbus', 10), ('B787', 'Boeing', 11), ('C-130 Cargo', 'Boeing', 12),
  ('B707', 'Boeing', 13), ('DC10', 'Douglas', 14), ('MD-11 Cargo', 'Boeing', 15),
  ('A340', 'Airbus', 16), ('AN-22', 'Boeing', 17), ('A350', 'Airbus', 18),
  ('B777', 'Boeing', 19), ('B747', 'Boeing', 20), ('A380', 'Airbus', 21),
  ('BelugaXL', 'Airbus', 22), ('Dreamlifter', 'Boeing', 23),
  ('CONCORDE', '', 24), ('AN-225', 'Boeing', 25)
ON CONFLICT (nom) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- FICHIERS À EXÉCUTER SÉPARÉMENT (systèmes complets avec beaucoup de SQL) :
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. supabase/add_siavi_system.sql            → Système SIAVI/AFIS complet
-- 2. supabase/add_recrutement_ifsa_system.sql → Système IFSA recrutement
-- 3. supabase/add_sanctions_system.sql        → Sanctions IFSA
-- 4. supabase/add_autorisations_exploitation.sql → Autorisations d'exploitation
-- 5. supabase/add_cartes_identite.sql         → Cartes d'identité joueur
-- 6. supabase/add_storage_cartes.sql          → Bucket storage cartes (storage.objects)
-- 7. supabase/OPTIMISATION_INDEX.sql          → Tous les index de performance
-- 8. supabase/seed_avions_ptfs.sql            → Mise à jour prix/capacités avions
-- 9. supabase/sid-star/seed-all-complet.sql   → Données SID/STAR par aéroport
-- ════════════════════════════════════════════════════════════════════════════
