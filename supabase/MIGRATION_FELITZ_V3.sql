-- ============================================================
-- MIGRATION FELITZ BANK V3 - TABLES UNIQUEMENT
-- Exécuter APRÈS le nettoyage
-- ============================================================

-- ===========================================
-- PARTIE 1: MODIFICATIONS TABLES EXISTANTES
-- ===========================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa'));

ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS pdg_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prix_billet_pax INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS prix_kg_cargo INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pourcentage_salaire INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS vban TEXT UNIQUE;

ALTER TABLE public.types_avion
  ADD COLUMN IF NOT EXISTS prix INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_pax INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_cargo_kg INTEGER NOT NULL DEFAULT 0;

-- ===========================================
-- PARTIE 2: CRÉER TOUTES LES TABLES
-- ===========================================

CREATE TABLE public.compagnie_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_embauche TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, pilote_id)
);

CREATE TABLE public.felitz_comptes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  proprietaire_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  vban TEXT NOT NULL UNIQUE,
  solde INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.felitz_virements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_source_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  compte_dest_vban TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.felitz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventaire_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietaire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  nom_personnalise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.compagnie_flotte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  nom_personnalise TEXT,
  capacite_pax_custom INTEGER,
  capacite_cargo_custom INTEGER,
  UNIQUE(compagnie_id, type_avion_id)
);

CREATE TABLE public.taxes_aeroport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  taxe_pourcent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  taxe_vfr_pourcent NUMERIC(5,2) NOT NULL DEFAULT 5.00
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinataire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- PARTIE 3: INDEX
-- ===========================================

CREATE INDEX idx_compagnie_employes_compagnie ON public.compagnie_employes(compagnie_id);
CREATE INDEX idx_compagnie_employes_pilote ON public.compagnie_employes(pilote_id);
CREATE INDEX idx_felitz_comptes_proprietaire ON public.felitz_comptes(proprietaire_id);
CREATE INDEX idx_felitz_comptes_compagnie ON public.felitz_comptes(compagnie_id);
CREATE INDEX idx_felitz_comptes_vban ON public.felitz_comptes(vban);
CREATE INDEX idx_felitz_virements_source ON public.felitz_virements(compte_source_id);
CREATE INDEX idx_felitz_virements_date ON public.felitz_virements(created_at DESC);
CREATE INDEX idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
CREATE INDEX idx_felitz_transactions_date ON public.felitz_transactions(created_at DESC);
CREATE INDEX idx_inventaire_avions_proprietaire ON public.inventaire_avions(proprietaire_id);
CREATE INDEX idx_compagnie_flotte_compagnie ON public.compagnie_flotte(compagnie_id);
CREATE INDEX idx_messages_destinataire ON public.messages(destinataire_id);

-- ===========================================
-- PARTIE 4: PLANS_VOL
-- ===========================================

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS vol_commercial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS route_ifr TEXT,
  ADD COLUMN IF NOT EXISTS note_atc TEXT,
  ADD COLUMN IF NOT EXISTS nature_transport TEXT,
  ADD COLUMN IF NOT EXISTS nb_pax_genere INTEGER,
  ADD COLUMN IF NOT EXISTS cargo_kg_genere INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_brut INTEGER,
  ADD COLUMN IF NOT EXISTS taxes_montant INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_net INTEGER,
  ADD COLUMN IF NOT EXISTS salaire_pilote INTEGER,
  ADD COLUMN IF NOT EXISTS inventaire_avion_id UUID REFERENCES public.inventaire_avions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flotte_avion_id UUID REFERENCES public.compagnie_flotte(id) ON DELETE SET NULL;

-- Ajouter compagnie_id si pas déjà présent
DO $$ BEGIN
  ALTER TABLE public.plans_vol ADD COLUMN compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ===========================================
-- PARTIE 5: RLS
-- ===========================================

ALTER TABLE public.compagnie_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_virements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnie_flotte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxes_aeroport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- compagnie_employes
CREATE POLICY "ce_select" ON public.compagnie_employes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ce_admin" ON public.compagnie_employes FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- felitz_comptes
CREATE POLICY "fc_select_own" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (proprietaire_id = auth.uid());
CREATE POLICY "fc_select_pdg" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (type = 'entreprise' AND compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));
CREATE POLICY "fc_admin" ON public.felitz_comptes FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- felitz_virements
CREATE POLICY "fv_select" ON public.felitz_virements FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "fv_insert" ON public.felitz_virements FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "fv_admin" ON public.felitz_virements FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- felitz_transactions
CREATE POLICY "ft_select" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (compte_id IN (SELECT id FROM public.felitz_comptes WHERE proprietaire_id = auth.uid()));
CREATE POLICY "ft_admin" ON public.felitz_transactions FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- inventaire_avions
CREATE POLICY "ia_select" ON public.inventaire_avions FOR SELECT TO authenticated
  USING (proprietaire_id = auth.uid());
CREATE POLICY "ia_insert" ON public.inventaire_avions FOR INSERT TO authenticated
  WITH CHECK (proprietaire_id = auth.uid());
CREATE POLICY "ia_admin" ON public.inventaire_avions FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- compagnie_flotte
CREATE POLICY "cf_select" ON public.compagnie_flotte FOR SELECT TO authenticated USING (true);
CREATE POLICY "cf_pdg" ON public.compagnie_flotte FOR ALL TO authenticated
  USING (compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));
CREATE POLICY "cf_admin" ON public.compagnie_flotte FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- taxes_aeroport
CREATE POLICY "ta_select" ON public.taxes_aeroport FOR SELECT TO authenticated USING (true);
CREATE POLICY "ta_admin" ON public.taxes_aeroport FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- messages
CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated
  USING (destinataire_id = auth.uid());
CREATE POLICY "msg_update" ON public.messages FOR UPDATE TO authenticated
  USING (destinataire_id = auth.uid());
CREATE POLICY "msg_admin" ON public.messages FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ===========================================
-- PARTIE 6: FONCTIONS
-- ===========================================

CREATE OR REPLACE FUNCTION generate_vban(prefix TEXT DEFAULT 'MIXOU') RETURNS TEXT AS $$
DECLARE
  res TEXT;
  ch TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
BEGIN
  res := prefix;
  FOR i IN 1..22 LOOP
    res := res || substr(ch, floor(random() * 36 + 1)::int, 1);
  END LOOP;
  RETURN res;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_personal_felitz_account() RETURNS TRIGGER AS $$
DECLARE
  vb TEXT;
BEGIN
  LOOP
    vb := generate_vban('MIXOU');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = vb);
  END LOOP;
  INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
  VALUES ('personnel', NEW.id, vb, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_felitz_profile ON public.profiles;
CREATE TRIGGER trg_create_felitz_profile
  AFTER INSERT ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION create_personal_felitz_account();

CREATE OR REPLACE FUNCTION set_company_vban_fn() RETURNS TRIGGER AS $$
DECLARE
  vb TEXT;
BEGIN
  IF NEW.vban IS NULL THEN
    LOOP
      vb := generate_vban('ENTERMIXOU');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = vb);
    END LOOP;
    NEW.vban := vb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_company_vban ON public.compagnies;
CREATE TRIGGER trg_set_company_vban
  BEFORE INSERT ON public.compagnies FOR EACH ROW
  EXECUTE FUNCTION set_company_vban_fn();

CREATE OR REPLACE FUNCTION create_company_felitz_fn() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE compagnie_id = NEW.id) THEN
    INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde)
    VALUES ('entreprise', NEW.id, NEW.vban, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_felitz_company ON public.compagnies;
CREATE TRIGGER trg_create_felitz_company
  AFTER INSERT ON public.compagnies FOR EACH ROW
  EXECUTE FUNCTION create_company_felitz_fn();

-- ===========================================
-- PARTIE 7: COMPTES EXISTANTS
-- ===========================================

-- Comptes personnels
DO $$
DECLARE
  r RECORD;
  vb TEXT;
BEGIN
  FOR r IN 
    SELECT p.id FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.felitz_comptes fc WHERE fc.proprietaire_id = p.id)
  LOOP
    LOOP
      vb := generate_vban('MIXOU');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = vb);
    END LOOP;
    INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
    VALUES ('personnel', r.id, vb, 0);
  END LOOP;
END;
$$;

-- VBAN compagnies
DO $$
DECLARE
  r RECORD;
  vb TEXT;
BEGIN
  FOR r IN SELECT id FROM public.compagnies WHERE vban IS NULL LOOP
    LOOP
      vb := generate_vban('ENTERMIXOU');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = vb);
    END LOOP;
    UPDATE public.compagnies SET vban = vb WHERE id = r.id;
  END LOOP;
END;
$$;

-- Comptes entreprise
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT c.id, c.vban FROM public.compagnies c
    WHERE c.vban IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM public.felitz_comptes fc WHERE fc.compagnie_id = c.id)
  LOOP
    INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde)
    VALUES ('entreprise', r.id, r.vban, 0);
  END LOOP;
END;
$$;

-- ===========================================
-- RÉSULTAT
-- ===========================================
SELECT 'OK' as status, 
  (SELECT count(*) FROM public.felitz_comptes WHERE type = 'personnel') as comptes_perso,
  (SELECT count(*) FROM public.felitz_comptes WHERE type = 'entreprise') as comptes_entreprise;
