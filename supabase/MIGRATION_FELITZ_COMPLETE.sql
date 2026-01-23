-- ============================================================
-- MIGRATION COMPLÈTE FELITZ BANK & COMPAGNIES
-- Copier-coller TOUT ce fichier dans l'éditeur SQL Supabase
-- ============================================================

-- ===========================================
-- PARTIE 1: MODIFICATIONS DE TABLES EXISTANTES
-- ===========================================

-- Ajouter rôle IFSA
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa'));

-- Modifier compagnies pour PDG et paramètres
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS pdg_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prix_billet_pax INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS prix_kg_cargo INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pourcentage_salaire INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS vban TEXT UNIQUE;

-- Prix et capacités avions
ALTER TABLE public.types_avion
  ADD COLUMN IF NOT EXISTS prix INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_pax INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacite_cargo_kg INTEGER NOT NULL DEFAULT 0;

-- Plans de vol commerciaux
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
  ADD COLUMN IF NOT EXISTS flotte_avion_id UUID;

-- Contrainte nature_transport
ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_nature_transport_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_nature_transport_check
  CHECK (nature_transport IS NULL OR nature_transport IN ('passagers', 'cargo'));

-- ===========================================
-- PARTIE 2: NOUVELLES TABLES
-- ===========================================

-- Table employés de compagnies
CREATE TABLE IF NOT EXISTS public.compagnie_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  pilote_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_embauche TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, pilote_id)
);
CREATE INDEX IF NOT EXISTS idx_compagnie_employes_compagnie ON public.compagnie_employes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnie_employes_pilote ON public.compagnie_employes(pilote_id);

-- Comptes bancaires Felitz
CREATE TABLE IF NOT EXISTS public.felitz_comptes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('personnel', 'entreprise')),
  proprietaire_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  vban TEXT NOT NULL UNIQUE,
  solde INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (type = 'personnel' AND proprietaire_id IS NOT NULL AND compagnie_id IS NULL) OR
    (type = 'entreprise' AND compagnie_id IS NOT NULL AND proprietaire_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_proprietaire ON public.felitz_comptes(proprietaire_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_compagnie ON public.felitz_comptes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_vban ON public.felitz_comptes(vban);

-- Virements Felitz
CREATE TABLE IF NOT EXISTS public.felitz_virements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_source_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  compte_dest_vban TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_felitz_virements_source ON public.felitz_virements(compte_source_id);
CREATE INDEX IF NOT EXISTS idx_felitz_virements_date ON public.felitz_virements(created_at DESC);

-- Transactions Felitz (historique)
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

-- Inventaire personnel d'avions
CREATE TABLE IF NOT EXISTS public.inventaire_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietaire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  nom_personnalise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventaire_avions_proprietaire ON public.inventaire_avions(proprietaire_id);

-- Flotte des compagnies
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
CREATE INDEX IF NOT EXISTS idx_compagnie_flotte_compagnie ON public.compagnie_flotte(compagnie_id);

-- Taxes aéroportuaires
CREATE TABLE IF NOT EXISTS public.taxes_aeroport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  taxe_pourcent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  taxe_vfr_pourcent NUMERIC(5,2) NOT NULL DEFAULT 5.00
);

-- Messagerie
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinataire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_destinataire ON public.messages(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_messages_lu ON public.messages(lu) WHERE lu = false;

-- Ajouter les FK manquantes sur plans_vol
ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_inventaire_avion_id_fkey;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_inventaire_avion_id_fkey 
  FOREIGN KEY (inventaire_avion_id) REFERENCES public.inventaire_avions(id) ON DELETE SET NULL;

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_flotte_avion_id_fkey;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_flotte_avion_id_fkey 
  FOREIGN KEY (flotte_avion_id) REFERENCES public.compagnie_flotte(id) ON DELETE SET NULL;

-- ===========================================
-- PARTIE 3: POLITIQUES RLS
-- ===========================================

-- Compagnie employés
ALTER TABLE public.compagnie_employes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compagnie_employes_select" ON public.compagnie_employes;
CREATE POLICY "compagnie_employes_select" ON public.compagnie_employes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "compagnie_employes_admin" ON public.compagnie_employes;
CREATE POLICY "compagnie_employes_admin" ON public.compagnie_employes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Felitz comptes
ALTER TABLE public.felitz_comptes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "felitz_comptes_select_self" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_select_self" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (proprietaire_id = auth.uid() OR 
    (type = 'entreprise' AND compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())));
DROP POLICY IF EXISTS "felitz_comptes_select_admin" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_select_admin" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "felitz_comptes_admin" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_admin" ON public.felitz_comptes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Felitz virements
ALTER TABLE public.felitz_virements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "felitz_virements_select_self" ON public.felitz_virements;
CREATE POLICY "felitz_virements_select_self" ON public.felitz_virements FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR compte_source_id IN (SELECT id FROM public.felitz_comptes WHERE proprietaire_id = auth.uid()));
DROP POLICY IF EXISTS "felitz_virements_insert" ON public.felitz_virements;
CREATE POLICY "felitz_virements_insert" ON public.felitz_virements FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "felitz_virements_admin" ON public.felitz_virements;
CREATE POLICY "felitz_virements_admin" ON public.felitz_virements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Felitz transactions
ALTER TABLE public.felitz_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "felitz_transactions_select_self" ON public.felitz_transactions;
CREATE POLICY "felitz_transactions_select_self" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (compte_id IN (SELECT id FROM public.felitz_comptes WHERE proprietaire_id = auth.uid() OR 
    (type = 'entreprise' AND compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()))));
DROP POLICY IF EXISTS "felitz_transactions_admin" ON public.felitz_transactions;
CREATE POLICY "felitz_transactions_admin" ON public.felitz_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Inventaire avions
ALTER TABLE public.inventaire_avions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventaire_avions_select_self" ON public.inventaire_avions;
CREATE POLICY "inventaire_avions_select_self" ON public.inventaire_avions FOR SELECT TO authenticated
  USING (proprietaire_id = auth.uid());
DROP POLICY IF EXISTS "inventaire_avions_admin" ON public.inventaire_avions;
CREATE POLICY "inventaire_avions_admin" ON public.inventaire_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "inventaire_avions_insert_self" ON public.inventaire_avions;
CREATE POLICY "inventaire_avions_insert_self" ON public.inventaire_avions FOR INSERT TO authenticated
  WITH CHECK (proprietaire_id = auth.uid());

-- Compagnie flotte
ALTER TABLE public.compagnie_flotte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compagnie_flotte_select" ON public.compagnie_flotte;
CREATE POLICY "compagnie_flotte_select" ON public.compagnie_flotte FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "compagnie_flotte_pdg" ON public.compagnie_flotte;
CREATE POLICY "compagnie_flotte_pdg" ON public.compagnie_flotte FOR ALL TO authenticated
  USING (compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()))
  WITH CHECK (compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));
DROP POLICY IF EXISTS "compagnie_flotte_admin" ON public.compagnie_flotte;
CREATE POLICY "compagnie_flotte_admin" ON public.compagnie_flotte FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Taxes aeroport
ALTER TABLE public.taxes_aeroport ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "taxes_aeroport_select" ON public.taxes_aeroport;
CREATE POLICY "taxes_aeroport_select" ON public.taxes_aeroport FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "taxes_aeroport_admin" ON public.taxes_aeroport;
CREATE POLICY "taxes_aeroport_admin" ON public.taxes_aeroport FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select_self" ON public.messages;
CREATE POLICY "messages_select_self" ON public.messages FOR SELECT TO authenticated
  USING (destinataire_id = auth.uid());
DROP POLICY IF EXISTS "messages_update_self" ON public.messages;
CREATE POLICY "messages_update_self" ON public.messages FOR UPDATE TO authenticated
  USING (destinataire_id = auth.uid());
DROP POLICY IF EXISTS "messages_admin" ON public.messages;
CREATE POLICY "messages_admin" ON public.messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===========================================
-- PARTIE 4: FONCTIONS ET TRIGGERS
-- ===========================================

-- Fonction pour générer VBAN
CREATE OR REPLACE FUNCTION generate_vban(prefix TEXT DEFAULT 'MIXOU') RETURNS TEXT AS $$
DECLARE
  result TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  i INTEGER;
BEGIN
  result := prefix;
  FOR i IN 1..22 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour créer compte personnel automatiquement
CREATE OR REPLACE FUNCTION create_personal_felitz_account() RETURNS TRIGGER AS $$
DECLARE
  new_vban TEXT;
BEGIN
  LOOP
    new_vban := generate_vban('MIXOU');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = new_vban);
  END LOOP;
  
  INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
  VALUES ('personnel', NEW.id, new_vban, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_felitz_account_on_profile ON public.profiles;
CREATE TRIGGER create_felitz_account_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_personal_felitz_account();

-- Fonction pour créer compte entreprise automatiquement
CREATE OR REPLACE FUNCTION create_company_felitz_account() RETURNS TRIGGER AS $$
DECLARE
  new_vban TEXT;
BEGIN
  IF NEW.vban IS NULL THEN
    LOOP
      new_vban := generate_vban('ENTERMIXOU');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = new_vban)
                AND NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = new_vban);
    END LOOP;
    
    NEW.vban := new_vban;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_company_vban ON public.compagnies;
CREATE TRIGGER set_company_vban
  BEFORE INSERT ON public.compagnies
  FOR EACH ROW
  EXECUTE FUNCTION create_company_felitz_account();

-- Trigger pour créer le compte Felitz entreprise après insertion
CREATE OR REPLACE FUNCTION create_company_felitz_account_after() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE compagnie_id = NEW.id AND type = 'entreprise') THEN
    INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde)
    VALUES ('entreprise', NEW.id, NEW.vban, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_felitz_account_on_compagnie ON public.compagnies;
CREATE TRIGGER create_felitz_account_on_compagnie
  AFTER INSERT ON public.compagnies
  FOR EACH ROW
  EXECUTE FUNCTION create_company_felitz_account_after();

-- ===========================================
-- PARTIE 5: CRÉER COMPTES POUR EXISTANTS
-- ===========================================

-- Comptes personnels pour utilisateurs existants
INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
SELECT 
  'personnel',
  p.id,
  'MIXOU' || upper(substr(md5(random()::text || clock_timestamp()::text || p.id::text), 1, 22)),
  0
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.felitz_comptes fc 
  WHERE fc.proprietaire_id = p.id AND fc.type = 'personnel'
)
ON CONFLICT DO NOTHING;

-- VBAN pour compagnies existantes sans VBAN
UPDATE public.compagnies c
SET vban = 'ENTERMIXOU' || upper(substr(md5(random()::text || clock_timestamp()::text || c.id::text), 1, 16))
WHERE c.vban IS NULL;

-- Comptes entreprise pour compagnies existantes
INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde)
SELECT 
  'entreprise',
  c.id,
  c.vban,
  0
FROM public.compagnies c
WHERE c.vban IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.felitz_comptes fc 
  WHERE fc.compagnie_id = c.id AND fc.type = 'entreprise'
)
ON CONFLICT DO NOTHING;

-- ===========================================
-- VÉRIFICATION
-- ===========================================
SELECT 'Comptes personnels:' as type, count(*) as total FROM public.felitz_comptes WHERE type = 'personnel'
UNION ALL
SELECT 'Comptes entreprise:' as type, count(*) as total FROM public.felitz_comptes WHERE type = 'entreprise';
