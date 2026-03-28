-- ============================================================
-- MIGRATION : REFONTE ALLIANCES + ENTREPRISES DE RÉPARATION
-- ============================================================
-- Phase 1 : Refonte complète du système d'alliances
-- Phase 2 : Entreprises de réparation (nouvelle entité)
-- Phase 3 : Mini-jeux de réparation (scores)
-- ============================================================

-- ████████████████████████████████████████████████████████████
-- PHASE 1 : REFONTE ALLIANCES
-- ████████████████████████████████████████████████████████████

-- 1.0) Supprimer anciennes tables alliance (en ordre pour respecter les FK)
DROP TABLE IF EXISTS public.alliance_transferts_avions CASCADE;
DROP TABLE IF EXISTS public.alliance_demandes_fonds CASCADE;
DROP TABLE IF EXISTS public.alliance_avions_membres CASCADE;
DROP TABLE IF EXISTS public.alliance_parametres CASCADE;
DROP TABLE IF EXISTS public.alliance_membres CASCADE;

-- Supprimer anciennes fonctions
DROP FUNCTION IF EXISTS public.alliance_creer(TEXT, UUID);
DROP FUNCTION IF EXISTS public.alliance_quitter(UUID);

-- NE PAS supprimer public.alliances car compagnies.alliance_id la référence.
-- On va plutôt la modifier en place.

-- 1.1) Modifier la table alliances (ajouter colonnes manquantes)
ALTER TABLE public.alliances ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.alliances ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.alliances ADD COLUMN IF NOT EXISTS devise TEXT;

-- 1.2) Nouvelle table alliance_membres (avec rôles enrichis)
CREATE TABLE IF NOT EXISTS public.alliance_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'membre' CHECK (role IN ('president', 'vice_president', 'secretaire', 'membre')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(alliance_id, compagnie_id)
);
CREATE INDEX IF NOT EXISTS idx_alliance_membres_alliance ON public.alliance_membres(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_membres_compagnie ON public.alliance_membres(compagnie_id);

-- 1.3) Table invitations
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
CREATE INDEX IF NOT EXISTS idx_alliance_invitations_alliance ON public.alliance_invitations(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_invitations_compagnie ON public.alliance_invitations(compagnie_id);

-- 1.4) Paramètres alliance (refonte)
CREATE TABLE IF NOT EXISTS public.alliance_parametres (
  alliance_id UUID PRIMARY KEY REFERENCES public.alliances(id) ON DELETE CASCADE,
  codeshare_actif BOOLEAN NOT NULL DEFAULT false,
  codeshare_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (codeshare_pourcent >= 0 AND codeshare_pourcent <= 100),
  taxe_alliance_actif BOOLEAN NOT NULL DEFAULT false,
  taxe_alliance_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taxe_alliance_pourcent >= 0 AND taxe_alliance_pourcent <= 100),
  transfert_avions_actif BOOLEAN NOT NULL DEFAULT false,
  pret_avions_actif BOOLEAN NOT NULL DEFAULT false,
  don_avions_actif BOOLEAN NOT NULL DEFAULT false,
  partage_hubs_actif BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5) Annonces alliance
CREATE TABLE IF NOT EXISTS public.alliance_annonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  important BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alliance_annonces_alliance ON public.alliance_annonces(alliance_id);

-- 1.6) Transferts d'avions entre membres
CREATE TABLE IF NOT EXISTS public.alliance_transferts_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  type_transfert TEXT NOT NULL CHECK (type_transfert IN ('vente', 'don', 'pret')),
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  compagnie_source_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  compagnie_dest_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  prix INTEGER CHECK (prix IS NULL OR prix >= 0),
  duree_jours INTEGER,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'complete', 'retourne')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alliance_transferts_alliance ON public.alliance_transferts_avions(alliance_id);

-- 1.7) Demandes de fonds
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
CREATE INDEX IF NOT EXISTS idx_alliance_demandes_fonds_alliance ON public.alliance_demandes_fonds(alliance_id);

-- 1.8) Contributions au compte alliance
CREATE TABLE IF NOT EXISTS public.alliance_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alliance_contributions_alliance ON public.alliance_contributions(alliance_id);

-- 1.9) RLS Alliances
ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_transferts_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_demandes_fonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_contributions ENABLE ROW LEVEL SECURITY;

-- Helper: compagnies de l'utilisateur courant
-- (pas de fonction car RLS inline)

-- alliances: voir si ma compagnie est membre
DROP POLICY IF EXISTS "alliances_select_member" ON public.alliances;
CREATE POLICY "alliances_select_member" ON public.alliances FOR SELECT TO authenticated
  USING (id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliances_insert_pdg" ON public.alliances;
CREATE POLICY "alliances_insert_pdg" ON public.alliances FOR INSERT TO authenticated
  WITH CHECK (created_by_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));

DROP POLICY IF EXISTS "alliances_update_admin" ON public.alliances;
CREATE POLICY "alliances_update_admin" ON public.alliances FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR id IN (SELECT am.alliance_id FROM public.alliance_membres am WHERE am.compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()) AND am.role IN ('president', 'vice_president'))
  );

-- alliance_membres
DROP POLICY IF EXISTS "alliance_membres_select" ON public.alliance_membres;
CREATE POLICY "alliance_membres_select" ON public.alliance_membres FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am2.alliance_id FROM public.alliance_membres am2
    WHERE am2.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliance_membres_insert_dirigeant" ON public.alliance_membres;
CREATE POLICY "alliance_membres_insert" ON public.alliance_membres FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "alliance_membres_delete_self" ON public.alliance_membres;
CREATE POLICY "alliance_membres_delete" ON public.alliance_membres FOR DELETE TO authenticated
  USING (compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliance_membres_update" ON public.alliance_membres;
CREATE POLICY "alliance_membres_update" ON public.alliance_membres FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR alliance_id IN (SELECT am.alliance_id FROM public.alliance_membres am WHERE am.compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()) AND am.role = 'president'));

-- alliance_invitations
CREATE POLICY "alliance_invitations_select" ON public.alliance_invitations FOR SELECT TO authenticated
  USING (
    compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR alliance_id IN (SELECT am.alliance_id FROM public.alliance_membres am WHERE am.compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "alliance_invitations_insert" ON public.alliance_invitations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "alliance_invitations_update" ON public.alliance_invitations FOR UPDATE TO authenticated USING (true);

-- alliance_parametres
CREATE POLICY "alliance_parametres_select" ON public.alliance_parametres FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliance_parametres_insert" ON public.alliance_parametres;
CREATE POLICY "alliance_parametres_insert" ON public.alliance_parametres FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "alliance_parametres_update_dirigeant" ON public.alliance_parametres;
CREATE POLICY "alliance_parametres_update" ON public.alliance_parametres FOR UPDATE TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid())
    AND am.role IN ('president', 'vice_president')
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- alliance_annonces
CREATE POLICY "alliance_annonces_select" ON public.alliance_annonces FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "alliance_annonces_insert" ON public.alliance_annonces FOR INSERT TO authenticated WITH CHECK (true);

-- alliance_transferts_avions
DROP POLICY IF EXISTS "alliance_transferts_select" ON public.alliance_transferts_avions;
CREATE POLICY "alliance_transferts_select" ON public.alliance_transferts_avions FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliance_transferts_insert_membre" ON public.alliance_transferts_avions;
CREATE POLICY "alliance_transferts_insert" ON public.alliance_transferts_avions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "alliance_transferts_update" ON public.alliance_transferts_avions FOR UPDATE TO authenticated USING (true);

-- alliance_demandes_fonds
DROP POLICY IF EXISTS "alliance_demandes_fonds_select" ON public.alliance_demandes_fonds;
CREATE POLICY "alliance_demandes_fonds_select" ON public.alliance_demandes_fonds FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "alliance_demandes_fonds_insert" ON public.alliance_demandes_fonds;
CREATE POLICY "alliance_demandes_fonds_insert" ON public.alliance_demandes_fonds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "alliance_demandes_fonds_update" ON public.alliance_demandes_fonds FOR UPDATE TO authenticated USING (true);

-- alliance_contributions
CREATE POLICY "alliance_contributions_select" ON public.alliance_contributions FOR SELECT TO authenticated
  USING (alliance_id IN (
    SELECT am.alliance_id FROM public.alliance_membres am
    WHERE am.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  ) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "alliance_contributions_insert" ON public.alliance_contributions FOR INSERT TO authenticated WITH CHECK (true);

-- 1.10) Fonction : créer une alliance (refonte)
CREATE OR REPLACE FUNCTION public.alliance_creer(p_nom TEXT, p_compagnie_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pdg_id UUID;
  v_alliance_id UUID;
  v_vban TEXT;
BEGIN
  IF p_nom IS NULL OR trim(p_nom) = '' THEN
    RAISE EXCEPTION 'Le nom de l''alliance est requis';
  END IF;
  SELECT pdg_id INTO v_pdg_id FROM public.compagnies WHERE id = p_compagnie_id;
  IF v_pdg_id IS NULL OR v_pdg_id != auth.uid() THEN
    RAISE EXCEPTION 'Seul le PDG peut créer une alliance';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id) THEN
    RAISE EXCEPTION 'Cette compagnie fait déjà partie d''une alliance';
  END IF;

  INSERT INTO public.alliances (nom, created_by_compagnie_id) VALUES (trim(p_nom), p_compagnie_id) RETURNING id INTO v_alliance_id;
  INSERT INTO public.alliance_membres (alliance_id, compagnie_id, role, invited_by) VALUES (v_alliance_id, p_compagnie_id, 'president', v_pdg_id);
  INSERT INTO public.alliance_parametres (alliance_id) VALUES (v_alliance_id);
  UPDATE public.compagnies SET alliance_id = v_alliance_id WHERE id = p_compagnie_id;

  LOOP
    v_vban := 'MIXALLIANCE' || upper(substr(md5(random()::text || v_alliance_id::text), 1, 16));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = v_vban);
  END LOOP;
  INSERT INTO public.felitz_comptes (type, alliance_id, vban, solde) VALUES ('alliance', v_alliance_id, v_vban, 0);

  RETURN v_alliance_id;
END;
$$;

-- 1.11) Fonction : quitter l'alliance (refonte)
CREATE OR REPLACE FUNCTION public.alliance_quitter(p_compagnie_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_alliance_id UUID;
  v_membres_restants INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.compagnies WHERE id = p_compagnie_id AND pdg_id = auth.uid()) THEN
    RAISE EXCEPTION 'Seul le PDG peut faire quitter l''alliance';
  END IF;
  SELECT alliance_id INTO v_alliance_id FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id;
  IF v_alliance_id IS NULL THEN RAISE EXCEPTION 'Pas dans une alliance'; END IF;

  DELETE FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND compagnie_id = p_compagnie_id;
  UPDATE public.compagnies SET alliance_id = NULL WHERE id = p_compagnie_id;

  SELECT count(*) INTO v_membres_restants FROM public.alliance_membres WHERE alliance_id = v_alliance_id;
  IF v_membres_restants = 0 THEN
    DELETE FROM public.alliances WHERE id = v_alliance_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND role = 'president') THEN
      UPDATE public.alliance_membres SET role = 'president'
      WHERE id = (SELECT id FROM public.alliance_membres WHERE alliance_id = v_alliance_id ORDER BY joined_at ASC LIMIT 1);
    END IF;
  END IF;
END;
$$;


-- ████████████████████████████████████████████████████████████
-- PHASE 2 : ENTREPRISES DE RÉPARATION
-- ████████████████████████████████████████████████████████████

-- 2.1) Table entreprises de réparation
CREATE TABLE IF NOT EXISTS public.entreprises_reparation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  pdg_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entreprises_reparation_pdg ON public.entreprises_reparation(pdg_id);

-- 2.2) Employés de l'entreprise de réparation
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
CREATE INDEX IF NOT EXISTS idx_reparation_employes_entreprise ON public.reparation_employes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_reparation_employes_user ON public.reparation_employes(user_id);

-- 2.3) Hangars de réparation
CREATE TABLE IF NOT EXISTS public.reparation_hangars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  aeroport_code TEXT NOT NULL,
  nom TEXT,
  capacite INTEGER NOT NULL DEFAULT 2 CHECK (capacite >= 1 AND capacite <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, aeroport_code)
);
CREATE INDEX IF NOT EXISTS idx_reparation_hangars_entreprise ON public.reparation_hangars(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_reparation_hangars_aeroport ON public.reparation_hangars(aeroport_code);

-- 2.4) Tarifs de réparation
CREATE TABLE IF NOT EXISTS public.reparation_tarifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  type_avion_id UUID REFERENCES public.types_avion(id) ON DELETE CASCADE,
  prix_par_point INTEGER NOT NULL DEFAULT 1000 CHECK (prix_par_point >= 0),
  duree_estimee_par_point INTEGER NOT NULL DEFAULT 2 CHECK (duree_estimee_par_point >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, type_avion_id)
);
CREATE INDEX IF NOT EXISTS idx_reparation_tarifs_entreprise ON public.reparation_tarifs(entreprise_id);

-- 2.5) Demandes de réparation
CREATE TABLE IF NOT EXISTS public.reparation_demandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  hangar_id UUID NOT NULL REFERENCES public.reparation_hangars(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'demandee' CHECK (statut IN (
    'demandee', 'acceptee', 'en_transit', 'en_reparation', 'mini_jeux',
    'terminee', 'facturee', 'payee', 'retour_transit', 'completee',
    'refusee', 'annulee'
  )),
  usure_avant INTEGER,
  usure_apres INTEGER,
  prix_total INTEGER,
  score_qualite INTEGER CHECK (score_qualite IS NULL OR (score_qualite >= 0 AND score_qualite <= 100)),
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
CREATE INDEX IF NOT EXISTS idx_reparation_demandes_entreprise ON public.reparation_demandes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_reparation_demandes_compagnie ON public.reparation_demandes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_reparation_demandes_avion ON public.reparation_demandes(avion_id);
CREATE INDEX IF NOT EXISTS idx_reparation_demandes_statut ON public.reparation_demandes(statut);

-- 2.6) Scores des mini-jeux
CREATE TABLE IF NOT EXISTS public.reparation_mini_jeux_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.reparation_demandes(id) ON DELETE CASCADE,
  type_jeu TEXT NOT NULL CHECK (type_jeu IN ('inspection', 'calibrage', 'assemblage', 'test_moteur', 'cablage', 'hydraulique', 'soudure', 'diagnostic')),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  duree_secondes INTEGER NOT NULL CHECK (duree_secondes > 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(demande_id, type_jeu)
);
CREATE INDEX IF NOT EXISTS idx_reparation_mini_jeux_demande ON public.reparation_mini_jeux_scores(demande_id);

-- 2.7) Ajouter le type 'reparation' à felitz_comptes + FK entreprise_reparation_id
ALTER TABLE public.felitz_comptes
  ADD COLUMN IF NOT EXISTS entreprise_reparation_id UUID REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE public.felitz_comptes DROP CONSTRAINT IF EXISTS felitz_comptes_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.felitz_comptes ADD CONSTRAINT felitz_comptes_type_check
  CHECK (type IN ('personnel', 'entreprise', 'militaire', 'alliance', 'reparation'));

CREATE INDEX IF NOT EXISTS idx_felitz_comptes_reparation ON public.felitz_comptes(entreprise_reparation_id);

-- 2.8) RLS pour les tables de réparation
ALTER TABLE public.entreprises_reparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_hangars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparation_mini_jeux_scores ENABLE ROW LEVEL SECURITY;

-- entreprises_reparation : visible par tous les authenticated
CREATE POLICY "entreprises_reparation_select" ON public.entreprises_reparation FOR SELECT TO authenticated USING (true);
CREATE POLICY "entreprises_reparation_insert" ON public.entreprises_reparation FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "entreprises_reparation_update" ON public.entreprises_reparation FOR UPDATE TO authenticated
  USING (pdg_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "entreprises_reparation_delete" ON public.entreprises_reparation FOR DELETE TO authenticated
  USING (pdg_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- reparation_employes : visible par employés de l'entreprise ou admin
CREATE POLICY "reparation_employes_select" ON public.reparation_employes FOR SELECT TO authenticated USING (true);
CREATE POLICY "reparation_employes_insert" ON public.reparation_employes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reparation_employes_delete" ON public.reparation_employes FOR DELETE TO authenticated USING (true);

-- reparation_hangars : visible par tous
CREATE POLICY "reparation_hangars_select" ON public.reparation_hangars FOR SELECT TO authenticated USING (true);
CREATE POLICY "reparation_hangars_insert" ON public.reparation_hangars FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reparation_hangars_delete" ON public.reparation_hangars FOR DELETE TO authenticated USING (true);

-- reparation_tarifs : visible par tous
CREATE POLICY "reparation_tarifs_select" ON public.reparation_tarifs FOR SELECT TO authenticated USING (true);
CREATE POLICY "reparation_tarifs_insert" ON public.reparation_tarifs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reparation_tarifs_update" ON public.reparation_tarifs FOR UPDATE TO authenticated USING (true);

-- reparation_demandes : visible par employés de l'entreprise + compagnie concernée + admin
CREATE POLICY "reparation_demandes_select" ON public.reparation_demandes FOR SELECT TO authenticated
  USING (
    entreprise_id IN (SELECT re.entreprise_id FROM public.reparation_employes re WHERE re.user_id = auth.uid())
    OR compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid() UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "reparation_demandes_insert" ON public.reparation_demandes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reparation_demandes_update" ON public.reparation_demandes FOR UPDATE TO authenticated USING (true);

-- reparation_mini_jeux_scores
CREATE POLICY "reparation_mini_jeux_select" ON public.reparation_mini_jeux_scores FOR SELECT TO authenticated
  USING (
    demande_id IN (SELECT rd.id FROM public.reparation_demandes rd WHERE rd.entreprise_id IN (SELECT re.entreprise_id FROM public.reparation_employes re WHERE re.user_id = auth.uid()))
    OR demande_id IN (SELECT rd.id FROM public.reparation_demandes rd WHERE rd.compagnie_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "reparation_mini_jeux_insert" ON public.reparation_mini_jeux_scores FOR INSERT TO authenticated WITH CHECK (true);

-- 2.9) Politique SELECT felitz_comptes pour entreprises de réparation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'felitz_comptes' AND policyname = 'felitz_comptes_select_reparation') THEN
    CREATE POLICY "felitz_comptes_select_reparation" ON public.felitz_comptes FOR SELECT TO authenticated
      USING (type = 'reparation' AND entreprise_reparation_id IN (
        SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
      ));
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- FIN DES MIGRATIONS
-- ════════════════════════════════════════════════════════════
