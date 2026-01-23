-- Ajout rôle IFSA et système Felitz Bank
-- Exécuter dans l'éditeur SQL Supabase

-- 1) Ajouter IFSA au rôle
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pilote', 'atc', 'ifsa'));

-- 2) Table comptes Felitz Bank
CREATE TABLE IF NOT EXISTS public.felitz_comptes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_compte TEXT NOT NULL CHECK (type_compte IN ('personnel', 'entreprise')),
  vban TEXT NOT NULL UNIQUE,
  solde DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felitz_comptes_user ON public.felitz_comptes(user_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_compagnie ON public.felitz_comptes(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_felitz_comptes_vban ON public.felitz_comptes(vban);

-- 3) Table virements
CREATE TABLE IF NOT EXISTS public.felitz_virements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_emetteur_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  compte_destinataire_vban TEXT NOT NULL,
  montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
  libelle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felitz_virements_emetteur ON public.felitz_virements(compte_emetteur_id);

-- 4) Table transactions
CREATE TABLE IF NOT EXISTS public.felitz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id UUID NOT NULL REFERENCES public.felitz_comptes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('virement', 'salaire', 'revenue_vol', 'achat_avion', 'admin_ajout', 'admin_retrait', 'taxe')),
  montant DECIMAL(15, 2) NOT NULL,
  titre TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_felitz_transactions_created ON public.felitz_transactions(created_at DESC);

-- 5) Table PDG des compagnies
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS pdg_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compagnies_pdg ON public.compagnies(pdg_user_id);

-- 6) Table employés des compagnies
CREATE TABLE IF NOT EXISTS public.compagnies_employes (
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (compagnie_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_compagnies_employes_user ON public.compagnies_employes(user_id);

-- 7) Table avions des compagnies (avec quantités)
CREATE TABLE IF NOT EXISTS public.compagnies_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  capacite_passagers INTEGER,
  capacite_cargo_kg INTEGER,
  nom_avion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, type_avion_id)
);

CREATE INDEX IF NOT EXISTS idx_compagnies_avions_compagnie ON public.compagnies_avions(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnies_avions_type ON public.compagnies_avions(type_avion_id);

-- 8) Table inventaire personnel (avions achetés par les pilotes)
CREATE TABLE IF NOT EXISTS public.inventaire_personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, type_avion_id)
);

CREATE INDEX IF NOT EXISTS idx_inventaire_personnel_user ON public.inventaire_personnel(user_id);

-- 9) Table marketplace (prix des avions)
CREATE TABLE IF NOT EXISTS public.marketplace_avions (
  type_avion_id UUID PRIMARY KEY REFERENCES public.types_avion(id) ON DELETE CASCADE,
  prix DECIMAL(15, 2) NOT NULL CHECK (prix > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Table disponibilité avions (bloqués par plans de vol actifs)
CREATE TABLE IF NOT EXISTS public.avions_disponibilite (
  plan_vol_id UUID NOT NULL REFERENCES public.plans_vol(id) ON DELETE CASCADE,
  compagnie_avion_id UUID REFERENCES public.compagnies_avions(id) ON DELETE SET NULL,
  inventaire_personnel_id UUID REFERENCES public.inventaire_personnel(id) ON DELETE SET NULL,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_vol_id)
);

CREATE INDEX IF NOT EXISTS idx_avions_disponibilite_plan ON public.avions_disponibilite(plan_vol_id);
CREATE INDEX IF NOT EXISTS idx_avions_disponibilite_compagnie ON public.avions_disponibilite(compagnie_avion_id);
CREATE INDEX IF NOT EXISTS idx_avions_disponibilite_inventaire ON public.avions_disponibilite(inventaire_personnel_id);

-- 11) Table taxes aéroportuaires
CREATE TABLE IF NOT EXISTS public.taxes_aeroportuaires (
  code_aeroport TEXT PRIMARY KEY,
  taxe_base_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 2.00 CHECK (taxe_base_pourcent >= 0),
  taxe_vfr_pourcent DECIMAL(5, 2) NOT NULL DEFAULT 5.00 CHECK (taxe_vfr_pourcent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12) Table prix billets par compagnie
CREATE TABLE IF NOT EXISTS public.compagnies_prix_billets (
  compagnie_id UUID PRIMARY KEY REFERENCES public.compagnies(id) ON DELETE CASCADE,
  prix_billet_base DECIMAL(10, 2) NOT NULL DEFAULT 100.00 CHECK (prix_billet_base > 0),
  prix_cargo_kg DECIMAL(10, 2),
  pourcentage_salaire DECIMAL(5, 2) NOT NULL DEFAULT 10.00 CHECK (pourcentage_salaire >= 0 AND pourcentage_salaire <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13) Table messagerie (notifications de vol)
CREATE TABLE IF NOT EXISTS public.messagerie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vol_cloture', 'virement_recu', 'autre')),
  titre TEXT NOT NULL,
  message TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messagerie_user ON public.messagerie(user_id);
CREATE INDEX IF NOT EXISTS idx_messagerie_lu ON public.messagerie(user_id, lu);

-- 14) Ajouter colonnes aux plans de vol
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS vol_commercial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_ifr TEXT,
  ADD COLUMN IF NOT EXISTS note_atc TEXT,
  ADD COLUMN IF NOT EXISTS nature_transport TEXT CHECK (nature_transport IN ('passagers', 'cargo')),
  ADD COLUMN IF NOT EXISTS nombre_passagers INTEGER,
  ADD COLUMN IF NOT EXISTS poids_cargo_kg INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_total DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS taxes_aeroportuaires DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS revenue_effectif DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS temps_vol_reel_min INTEGER;

CREATE INDEX IF NOT EXISTS idx_plans_vol_compagnie ON public.plans_vol(compagnie_id);

-- RLS
ALTER TABLE public.felitz_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_virements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.felitz_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_avions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avions_disponibilite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxes_aeroportuaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compagnies_prix_billets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messagerie ENABLE ROW LEVEL SECURITY;

-- Policies Felitz comptes
CREATE POLICY "felitz_comptes_select_self" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_user_id = auth.uid()));
CREATE POLICY "felitz_comptes_select_admin" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "felitz_comptes_all_admin" ON public.felitz_comptes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies virements
CREATE POLICY "felitz_virements_select_self" ON public.felitz_virements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = compte_emetteur_id AND user_id = auth.uid()));
CREATE POLICY "felitz_virements_insert_self" ON public.felitz_virements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = compte_emetteur_id AND user_id = auth.uid()));

-- Policies transactions
CREATE POLICY "felitz_transactions_select_self" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.felitz_comptes WHERE id = compte_id AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_user_id = auth.uid()))));
CREATE POLICY "felitz_transactions_select_admin" ON public.felitz_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies compagnies_employes
CREATE POLICY "compagnies_employes_select_self" ON public.compagnies_employes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "compagnies_employes_all_admin" ON public.compagnies_employes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies compagnies_avions
CREATE POLICY "compagnies_avions_select_compagnie" ON public.compagnies_avions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compagnies_employes WHERE compagnie_id = compagnies_avions.compagnie_id AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnies_avions.compagnie_id AND pdg_user_id = auth.uid()));
CREATE POLICY "compagnies_avions_all_admin" ON public.compagnies_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "compagnies_avions_all_pdg" ON public.compagnies_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnies_avions.compagnie_id AND pdg_user_id = auth.uid()));

-- Policies inventaire_personnel
CREATE POLICY "inventaire_personnel_select_self" ON public.inventaire_personnel FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "inventaire_personnel_all_self" ON public.inventaire_personnel FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Policies marketplace
CREATE POLICY "marketplace_avions_select" ON public.marketplace_avions FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketplace_avions_all_admin" ON public.marketplace_avions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies taxes_aeroportuaires
CREATE POLICY "taxes_aeroportuaires_select" ON public.taxes_aeroportuaires FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxes_aeroportuaires_all_admin" ON public.taxes_aeroportuaires FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policies compagnies_prix_billets
CREATE POLICY "compagnies_prix_billets_select_compagnie" ON public.compagnies_prix_billets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compagnies_employes WHERE compagnie_id = compagnies_prix_billets.compagnie_id AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnies_prix_billets.compagnie_id AND pdg_user_id = auth.uid()));
CREATE POLICY "compagnies_prix_billets_all_pdg" ON public.compagnies_prix_billets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnies_prix_billets.compagnie_id AND pdg_user_id = auth.uid()));

-- Policies messagerie
CREATE POLICY "messagerie_select_self" ON public.messagerie FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "messagerie_insert_self" ON public.messagerie FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "messagerie_update_self" ON public.messagerie FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Fonction pour générer VBAN
CREATE OR REPLACE FUNCTION generate_vban(type_compte TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  random_part TEXT;
  vban_generated TEXT;
BEGIN
  IF type_compte = 'entreprise' THEN
    prefix := 'ENTERMIXOU';
  ELSE
    prefix := 'MIXOU';
  END IF;
  
  -- Générer 20 caractères aléatoires (chiffres et lettres majuscules)
  random_part := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
  vban_generated := prefix || random_part;
  
  -- Vérifier l'unicité (si collision, régénérer)
  -- Limite de sécurité pour éviter les boucles infinies
  DECLARE
    max_iterations INTEGER := 100;
    iteration_count INTEGER := 0;
  BEGIN
    WHILE EXISTS (SELECT 1 FROM public.felitz_comptes fc WHERE fc.vban = vban_generated) LOOP
      iteration_count := iteration_count + 1;
      IF iteration_count >= max_iterations THEN
        RAISE EXCEPTION 'Impossible de générer un VBAN unique après % tentatives', max_iterations;
      END IF;
      random_part := upper(substring(md5(random()::text || clock_timestamp()::text || iteration_count::text) from 1 for 20));
      vban_generated := prefix || random_part;
    END LOOP;
  END;
  
  RETURN vban_generated;
END;
$$ LANGUAGE plpgsql;
