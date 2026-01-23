-- Ajout rôle IFSA, système Felitz Bank, et gestion compagnies
-- Exécuter dans l'éditeur SQL Supabase

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

-- 1) Ajouter rôle IFSA
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa'));

-- 2) Felitz Bank - Comptes bancaires
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

-- 3) Felitz Bank - Transactions
CREATE TABLE IF NOT EXISTS public.felitz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('virement', 'salaire', 'revenue_vol', 'achat_avion', 'vente_avion', 'taxe', 'admin_ajout', 'admin_retrait')),
  montant DECIMAL(15, 2) NOT NULL,
  titre TEXT,
  libelle TEXT,
  compte_destinataire_id UUID REFERENCES public.felitz_comptes(id) ON DELETE SET NULL,
  plan_vol_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_felitz_transactions_plan_vol ON public.felitz_transactions(plan_vol_id);

-- 4) Felitz Bank - Virements
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

-- 5) Compagnies - PDG et employés
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

-- 6) Compagnies - Avions assignés
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

-- 7) Avions en utilisation (plans de vol)
CREATE TABLE IF NOT EXISTS public.avions_utilisation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnies_avions(id) ON DELETE CASCADE,
  plan_vol_id UUID NOT NULL REFERENCES public.plans_vol(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_avion_id, plan_vol_id)
);

CREATE INDEX IF NOT EXISTS idx_avions_utilisation_compagnie_avion ON public.avions_utilisation(compagnie_avion_id);
CREATE INDEX IF NOT EXISTS idx_avions_utilisation_plan_vol ON public.avions_utilisation(plan_vol_id);

-- 8) Inventaire personnel (avions achetés par les pilotes)
CREATE TABLE IF NOT EXISTS public.inventaire_pilote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  nom_avion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventaire_pilote_user ON public.inventaire_pilote(user_id);
CREATE INDEX IF NOT EXISTS idx_inventaire_pilote_type ON public.inventaire_pilote(type_avion_id);

-- 9) Marketplace - Prix des avions
CREATE TABLE IF NOT EXISTS public.marketplace_avions (
  type_avion_id UUID PRIMARY KEY REFERENCES public.types_avion(id) ON DELETE CASCADE,
  prix DECIMAL(15, 2) NOT NULL,
  capacite_cargo_kg INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Taxes aéroportuaires
CREATE TABLE IF NOT EXISTS public.taxes_aeroports (
  code_aeroport TEXT PRIMARY KEY,
  taxe_base_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 2.0,
  taxe_vfr_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11) Plans de vol - Route IFR et note ATC
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
  ADD COLUMN IF NOT EXISTS compagnie_avion_id UUID REFERENCES public.compagnies_avions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventaire_avion_id UUID REFERENCES public.inventaire_pilote(id) ON DELETE SET NULL;

-- 12) Messagerie
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'cloture_vol', 'virement', 'achat', 'autre')),
  plan_vol_id UUID REFERENCES public.plans_vol(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
CREATE POLICY "felitz_comptes_select_self" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "felitz_comptes_select_pdg" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compagnies c
      WHERE c.id = felitz_comptes.compagnie_id AND c.pdg_id = auth.uid()
    )
  );

-- Policies Felitz transactions
CREATE POLICY "felitz_transactions_select_self" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_transactions.compte_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies Felitz virements
CREATE POLICY "felitz_virements_select_self" ON public.felitz_virements FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_emetteur_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_destinataire_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "felitz_virements_insert_self" ON public.felitz_virements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = felitz_virements.compte_emetteur_id AND user_id = auth.uid())
  );

-- Policies compagnies employés
CREATE POLICY "compagnies_employes_select" ON public.compagnies_employes FOR SELECT TO authenticated USING (true);
CREATE POLICY "compagnies_employes_all_admin" ON public.compagnies_employes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies compagnies avions
CREATE POLICY "compagnies_avions_select" ON public.compagnies_avions FOR SELECT TO authenticated USING (true);
CREATE POLICY "compagnies_avions_all_admin" ON public.compagnies_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
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
CREATE POLICY "inventaire_pilote_select_self" ON public.inventaire_pilote FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "inventaire_pilote_insert_self" ON public.inventaire_pilote FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "inventaire_pilote_delete_self" ON public.inventaire_pilote FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Policies marketplace
CREATE POLICY "marketplace_avions_select" ON public.marketplace_avions FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketplace_avions_all_admin" ON public.marketplace_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies taxes aéroports
CREATE POLICY "taxes_aeroports_select" ON public.taxes_aeroports FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxes_aeroports_all_admin" ON public.taxes_aeroports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies messages
CREATE POLICY "messages_select_self" ON public.messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "messages_insert_system" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "messages_update_self" ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
