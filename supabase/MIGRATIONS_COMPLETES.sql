-- ============================================================
-- MIGRATIONS WEBLOGBOOK — à coller dans l'éditeur SQL Supabase
-- Si une erreur "already exists" apparaît, c'est que c'est déjà fait : passe au bloc suivant ou ignore.
-- ============================================================

-- Créer la fonction set_updated_at() si elle n'existe pas
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

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
-- On inclut 'Vol militaire' dès ici pour éviter une erreur 23514 si des vols militaires
-- existent déjà quand on ré-applique les migrations (le bloc 7 ne fait que ré-ajouter la même liste).
ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_type_vol_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_type_vol_check
  CHECK (type_vol IN ('IFR', 'VFR', 'Instruction', 'Vol militaire'));

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
    'depose', 'en_attente', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture'
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

-- ----- 9b) Statut en_attente_cloture (plans de vol) — exécuter si plans_vol existe déjà -----
ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut IN (
  'depose', 'en_attente', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture'
));

-- ----- 10) NOTAMs -----
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
CREATE INDEX IF NOT EXISTS idx_notams_annule ON public.notams(annule) WHERE annule = false;
ALTER TABLE public.notams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notams_select_authenticated" ON public.notams;
CREATE POLICY "notams_select_authenticated" ON public.notams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notams_insert_admin" ON public.notams;
CREATE POLICY "notams_insert_admin" ON public.notams FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "notams_update_admin" ON public.notams;
CREATE POLICY "notams_update_admin" ON public.notams FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "notams_delete_admin" ON public.notams;
CREATE POLICY "notams_delete_admin" ON public.notams FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ----- 11) Temps total en service ATC -----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atc_temps_total_minutes INTEGER NOT NULL DEFAULT 0;

-- ----- 12) Licences et qualifications -----
CREATE TABLE IF NOT EXISTS public.licences_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'PPL', 'CPL', 'ATPL',
    'IR ME',
    'Qualification Type',
    'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
    'C1', 'C2', 'C3', 'C4', 'C6',
    'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
    'IFR', 'VFR',
    'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
    'CAL-ATC', 'CAL-AFIS',
    'PCAL-ATC', 'PCAL-AFIS',
    'LPAFIS', 'LATC'
  )),
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
CREATE INDEX IF NOT EXISTS idx_licences_type_avion ON public.licences_qualifications(type_avion_id);
ALTER TABLE public.licences_qualifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "licences_select_self" ON public.licences_qualifications;
CREATE POLICY "licences_select_self" ON public.licences_qualifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "licences_select_admin" ON public.licences_qualifications;
CREATE POLICY "licences_select_admin" ON public.licences_qualifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "licences_insert_admin" ON public.licences_qualifications;
CREATE POLICY "licences_insert_admin" ON public.licences_qualifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "licences_update_admin" ON public.licences_qualifications;
CREATE POLICY "licences_update_admin" ON public.licences_qualifications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "licences_delete_admin" ON public.licences_qualifications;
CREATE POLICY "licences_delete_admin" ON public.licences_qualifications FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ----- 13) Rôle IFSA, système Felitz Bank, et gestion compagnies -----
-- IMPORTANT: Ce bloc nécessite que les blocs précédents (notamment le bloc 9 pour plans_vol) soient exécutés.
-- Vérification que plans_vol existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
    RAISE EXCEPTION 'La table plans_vol n''existe pas. Veuillez exécuter les blocs précédents (notamment le bloc 9) avant ce bloc.';
  END IF;
END $$;

-- Fonction pour générer VBAN unique
CREATE OR REPLACE FUNCTION generate_vban_personnel() RETURNS TEXT AS $$
DECLARE
  vban TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    vban := 'MIXOU' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
    SELECT EXISTS(SELECT 1 FROM public.felitz_comptes WHERE felitz_comptes.vban = vban) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN vban;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_vban_entreprise() RETURNS TEXT AS $$
DECLARE
  vban TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    vban := 'ENTERMIXOU' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 19));
    SELECT EXISTS(SELECT 1 FROM public.felitz_comptes WHERE felitz_comptes.vban = vban) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN vban;
END;
$$ LANGUAGE plpgsql;

-- Ajouter rôle IFSA
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa'));

-- Felitz Bank - Comptes bancaires
CREATE TABLE IF NOT EXISTS public.felitz_comptes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  vban TEXT NOT NULL UNIQUE,
  solde DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, compagnie_id)
);

CREATE INDEX IF NOT EXISTS idx_felitz_comptes_user ON public.felitz_comptes(user_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_compagnie ON public.felitz_comptes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_vban ON public.felitz_comptes(vban);

-- Felitz Bank - Transactions
CREATE TABLE IF NOT EXISTS public.felitz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('virement', 'salaire', 'revenue_vol', 'achat_avion', 'vente_avion', 'taxe', 'admin_ajout', 'admin_retrait')),
  montant DECIMAL(15, 2) NOT NULL,
  titre TEXT,
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ajouter les colonnes manquantes si elles n'existent pas
-- Utiliser une approche directe avec gestion d'erreur
DO $$
BEGIN
  -- Ajouter compte_destinataire_id
  BEGIN
    ALTER TABLE public.felitz_transactions ADD COLUMN compte_destinataire_id UUID;
  EXCEPTION 
    WHEN duplicate_column THEN
      -- La colonne existe déjà, c'est OK
      NULL;
    WHEN undefined_table THEN
      -- La table n'existe pas encore, sera créée plus tard
      NULL;
  END;
  
  -- Ajouter plan_vol_id
  BEGIN
    ALTER TABLE public.felitz_transactions ADD COLUMN plan_vol_id UUID;
  EXCEPTION 
    WHEN duplicate_column THEN
      -- La colonne existe déjà, c'est OK
      NULL;
    WHEN undefined_table THEN
      -- La table n'existe pas encore, sera créée plus tard
      NULL;
  END;
END $$;

-- Ajouter les contraintes de clés étrangères après avoir ajouté les colonnes
DO $$
BEGIN
  -- S'assurer que la table existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'felitz_transactions') THEN
    RETURN;
  END IF;
  
  -- S'assurer que la colonne compte_destinataire_id existe avant d'ajouter la contrainte
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'felitz_transactions' 
    AND column_name = 'compte_destinataire_id'
  ) THEN
    -- La colonne n'existe pas, l'ajouter maintenant
    BEGIN
      ALTER TABLE public.felitz_transactions ADD COLUMN compte_destinataire_id UUID;
    EXCEPTION WHEN OTHERS THEN
      -- Ignorer les erreurs
      NULL;
    END;
  END IF;
  
  -- Maintenant ajouter la contrainte si la colonne existe et si felitz_comptes existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'felitz_transactions' 
    AND column_name = 'compte_destinataire_id'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'felitz_comptes') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'felitz_transactions_compte_destinataire_id_fkey' 
      AND table_name = 'felitz_transactions'
    ) THEN
      BEGIN
        ALTER TABLE public.felitz_transactions
          ADD CONSTRAINT felitz_transactions_compte_destinataire_id_fkey 
          FOREIGN KEY (compte_destinataire_id) REFERENCES public.felitz_comptes(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN
        -- Ignorer les erreurs de contrainte
        NULL;
      END;
    END IF;
  END IF;
    
  -- S'assurer que la colonne plan_vol_id existe avant d'ajouter la contrainte
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'felitz_transactions' 
    AND column_name = 'plan_vol_id'
  ) THEN
    -- La colonne n'existe pas, l'ajouter maintenant
    BEGIN
      ALTER TABLE public.felitz_transactions ADD COLUMN plan_vol_id UUID;
    EXCEPTION WHEN OTHERS THEN
      -- Ignorer les erreurs
      NULL;
    END;
  END IF;
  
  -- Maintenant ajouter la contrainte si la colonne existe et si plans_vol existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'felitz_transactions' 
    AND column_name = 'plan_vol_id'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'felitz_transactions_plan_vol_id_fkey' 
      AND table_name = 'felitz_transactions'
    ) THEN
      BEGIN
        ALTER TABLE public.felitz_transactions
          ADD CONSTRAINT felitz_transactions_plan_vol_id_fkey 
          FOREIGN KEY (plan_vol_id) REFERENCES public.plans_vol(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN
        -- Ignorer les erreurs de contrainte
        NULL;
      END;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_felitz_transactions_plan_vol ON public.felitz_transactions(plan_vol_id);

-- Felitz Bank - Virements
CREATE TABLE IF NOT EXISTS public.felitz_virements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_emetteur_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  compte_destinataire_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  montant DECIMAL(15, 2) NOT NULL,
  libelle TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'effectue', 'refuse')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felitz_virements_emetteur ON public.felitz_virements(compte_emetteur_id);
CREATE INDEX IF NOT EXISTS idx_felitz_virements_destinataire ON public.felitz_virements(compte_destinataire_id);

-- Compagnies - PDG et employés
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS pdg_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pourcentage_paie DECIMAL(5, 2) NOT NULL DEFAULT 50.0;

CREATE TABLE IF NOT EXISTS public.compagnies_employes (
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  heures_vol_compagnie_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (compagnie_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_compagnies_employes_user ON public.compagnies_employes(user_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_employes_compagnie ON public.compagnies_employes(compagnie_id);

-- Compagnies - Avions assignés
CREATE TABLE IF NOT EXISTS public.compagnies_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1,
  capacite_passagers INTEGER,
  capacite_cargo_kg INTEGER,
  nom_avion TEXT,
  prix_billet_base DECIMAL(10, 2),
  prix_cargo_kg DECIMAL(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compagnies_avions_compagnie ON public.compagnies_avions(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_avions_type ON public.compagnies_avions(type_avion_id);

-- Avions en utilisation (plans de vol)
CREATE TABLE IF NOT EXISTS public.avions_utilisation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnies_avions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ajouter la colonne plan_vol_id si elle n'existe pas, puis la contrainte de clé étrangère si plans_vol existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'avions_utilisation') THEN
    -- Ajouter la colonne si elle n'existe pas
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'avions_utilisation' 
      AND column_name = 'plan_vol_id'
    ) THEN
      ALTER TABLE public.avions_utilisation ADD COLUMN plan_vol_id UUID NOT NULL;
    END IF;
    
    -- Ajouter la contrainte si plans_vol existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'avions_utilisation_plan_vol_id_fkey' 
        AND table_name = 'avions_utilisation'
      ) THEN
        ALTER TABLE public.avions_utilisation
          ADD CONSTRAINT avions_utilisation_plan_vol_id_fkey 
          FOREIGN KEY (plan_vol_id) REFERENCES public.plans_vol(id) ON DELETE CASCADE;
      END IF;
    END IF;
    
    -- Ajouter la contrainte UNIQUE si elle n'existe pas et si les colonnes existent
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'avions_utilisation' 
      AND column_name = 'compagnie_avion_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'avions_utilisation' 
      AND column_name = 'plan_vol_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'avions_utilisation_compagnie_avion_id_plan_vol_id_key' 
        AND table_name = 'avions_utilisation'
      ) THEN
        ALTER TABLE public.avions_utilisation
          ADD CONSTRAINT avions_utilisation_compagnie_avion_id_plan_vol_id_key 
          UNIQUE (compagnie_avion_id, plan_vol_id);
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_avions_utilisation_compagnie_avion ON public.avions_utilisation(compagnie_avion_id);
CREATE INDEX IF NOT EXISTS idx_avions_utilisation_plan_vol ON public.avions_utilisation(plan_vol_id);

-- Inventaire personnel (avions achetés par les pilotes)
CREATE TABLE IF NOT EXISTS public.inventaire_pilote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  nom_avion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventaire_pilote_user ON public.inventaire_pilote(user_id);
CREATE INDEX IF NOT EXISTS idx_inventaire_pilote_type ON public.inventaire_pilote(type_avion_id);

-- Marketplace - Prix des avions
CREATE TABLE IF NOT EXISTS public.marketplace_avions (
  type_avion_id UUID PRIMARY KEY REFERENCES public.types_avion(id) ON DELETE CASCADE,
  prix DECIMAL(15, 2) NOT NULL,
  capacite_cargo_kg INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Taxes aéroportuaires
CREATE TABLE IF NOT EXISTS public.taxes_aeroports (
  code_aeroport TEXT PRIMARY KEY,
  taxe_base_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 2.0,
  taxe_vfr_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plans de vol - Route IFR et note ATC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
    ALTER TABLE public.plans_vol
      ADD COLUMN IF NOT EXISTS route_ifr TEXT,
      ADD COLUMN IF NOT EXISTS note_atc TEXT,
      ADD COLUMN IF NOT EXISTS vol_commercial BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS nature_cargo TEXT,
      ADD COLUMN IF NOT EXISTS nombre_passagers INTEGER,
      ADD COLUMN IF NOT EXISTS cargo_kg INTEGER,
      ADD COLUMN IF NOT EXISTS revenue_total DECIMAL(15, 2),
      ADD COLUMN IF NOT EXISTS taxes_aeroportuaires DECIMAL(15, 2),
      ADD COLUMN IF NOT EXISTS revenue_effectif DECIMAL(15, 2),
      ADD COLUMN IF NOT EXISTS salaire_pilote DECIMAL(15, 2),
      ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID,
      ADD COLUMN IF NOT EXISTS inventaire_avion_id UUID,
      ADD COLUMN IF NOT EXISTS cloture_at TIMESTAMPTZ;
  END IF;
END $$;

-- Ajouter les contraintes de clés étrangères pour plans_vol si les tables référencées existent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
    -- Contrainte pour compagnie_avion_id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnies_avions') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'plans_vol_compagnie_avion_id_fkey' 
        AND table_name = 'plans_vol'
      ) THEN
        ALTER TABLE public.plans_vol
          ADD CONSTRAINT plans_vol_compagnie_avion_id_fkey 
          FOREIGN KEY (compagnie_avion_id) REFERENCES public.compagnies_avions(id) ON DELETE SET NULL;
      END IF;
    END IF;
    
    -- Contrainte pour inventaire_avion_id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventaire_pilote') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'plans_vol_inventaire_avion_id_fkey' 
        AND table_name = 'plans_vol'
      ) THEN
        ALTER TABLE public.plans_vol
          ADD CONSTRAINT plans_vol_inventaire_avion_id_fkey 
          FOREIGN KEY (inventaire_avion_id) REFERENCES public.inventaire_pilote(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Messagerie
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'cloture_vol', 'virement', 'achat', 'autre')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ajouter la colonne plan_vol_id si elle n'existe pas, puis la contrainte de clé étrangère si plans_vol existe
DO $$
BEGIN
  -- Ajouter la colonne si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'plan_vol_id'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN plan_vol_id UUID;
  END IF;
  
  -- Ajouter la contrainte si plans_vol existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans_vol') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'messages_plan_vol_id_fkey' 
      AND table_name = 'messages'
    ) THEN
      ALTER TABLE public.messages
        ADD CONSTRAINT messages_plan_vol_id_fkey 
        FOREIGN KEY (plan_vol_id) REFERENCES public.plans_vol(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_user ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_lu ON public.messages(lu) WHERE lu = false;

-- RLS
ALTER TABLE public.felitz_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_virements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avions_utilisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_pilote ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxes_aeroports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies Felitz comptes
DROP POLICY IF EXISTS "felitz_comptes_select_self" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_select_self" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "felitz_comptes_select_pdg" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_select_pdg" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compagnies c
      WHERE c.id = felitz_comptes.compagnie_id AND c.pdg_id = auth.uid()
    )
  );

-- Policies Felitz transactions
DROP POLICY IF EXISTS "felitz_transactions_select_self" ON public.felitz_transactions;
CREATE POLICY "felitz_transactions_select_self" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_transactions.compte_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies Felitz virements
DROP POLICY IF EXISTS "felitz_virements_select_self" ON public.felitz_virements;
CREATE POLICY "felitz_virements_select_self" ON public.felitz_virements FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_emetteur_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_destinataire_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "felitz_virements_insert_self" ON public.felitz_virements;
CREATE POLICY "felitz_virements_insert_self" ON public.felitz_virements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_emetteur_id AND user_id = auth.uid())
  );

-- Policies compagnies employés
DROP POLICY IF EXISTS "compagnies_employes_select" ON public.compagnies_employes;
CREATE POLICY "compagnies_employes_select" ON public.compagnies_employes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "compagnies_employes_all_admin" ON public.compagnies_employes;
CREATE POLICY "compagnies_employes_all_admin" ON public.compagnies_employes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies compagnies avions
DROP POLICY IF EXISTS "compagnies_avions_select" ON public.compagnies_avions;
CREATE POLICY "compagnies_avions_select" ON public.compagnies_avions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "compagnies_avions_all_admin" ON public.compagnies_avions;
CREATE POLICY "compagnies_avions_all_admin" ON public.compagnies_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "compagnies_avions_update_pdg" ON public.compagnies_avions;
CREATE POLICY "compagnies_avions_update_pdg" ON public.compagnies_avions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compagnies c
      WHERE c.id = compagnies_avions.compagnie_id AND c.pdg_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compagnies c
      WHERE c.id = compagnies_avions.compagnie_id AND c.pdg_id = auth.uid()
    )
  );

-- Policies inventaire pilote
DROP POLICY IF EXISTS "inventaire_pilote_select_self" ON public.inventaire_pilote;
CREATE POLICY "inventaire_pilote_select_self" ON public.inventaire_pilote FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "inventaire_pilote_insert_self" ON public.inventaire_pilote;
CREATE POLICY "inventaire_pilote_insert_self" ON public.inventaire_pilote FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "inventaire_pilote_delete_self" ON public.inventaire_pilote;
CREATE POLICY "inventaire_pilote_delete_self" ON public.inventaire_pilote FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Policies marketplace
DROP POLICY IF EXISTS "marketplace_avions_select" ON public.marketplace_avions;
CREATE POLICY "marketplace_avions_select" ON public.marketplace_avions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketplace_avions_all_admin" ON public.marketplace_avions;
CREATE POLICY "marketplace_avions_all_admin" ON public.marketplace_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies taxes aéroports
DROP POLICY IF EXISTS "taxes_aeroports_select" ON public.taxes_aeroports;
CREATE POLICY "taxes_aeroports_select" ON public.taxes_aeroports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "taxes_aeroports_all_admin" ON public.taxes_aeroports;
CREATE POLICY "taxes_aeroports_all_admin" ON public.taxes_aeroports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies messages
DROP POLICY IF EXISTS "messages_select_self" ON public.messages;
CREATE POLICY "messages_select_self" ON public.messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "messages_insert_system" ON public.messages;
CREATE POLICY "messages_insert_system" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "messages_update_self" ON public.messages;
CREATE POLICY "messages_update_self" ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
