-- ============================================================
-- MIGRATION: Système de tarification par liaison et saturation
-- ============================================================

-- Table des tarifs par liaison (définis par les PDG)
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

CREATE INDEX IF NOT EXISTS idx_tarifs_liaisons_compagnie ON public.tarifs_liaisons(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_tarifs_liaisons_route ON public.tarifs_liaisons(aeroport_depart, aeroport_arrivee);

-- Table de saturation des passagers par aéroport
-- Régénère les passagers toutes les heures ou par jour
CREATE TABLE IF NOT EXISTS public.aeroport_passagers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_oaci TEXT NOT NULL UNIQUE,
  passagers_disponibles INTEGER NOT NULL DEFAULT 10000,
  passagers_max INTEGER NOT NULL DEFAULT 10000,
  derniere_regeneration TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aeroport_passagers_code ON public.aeroport_passagers(code_oaci);

-- RLS
ALTER TABLE public.tarifs_liaisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeroport_passagers ENABLE ROW LEVEL SECURITY;

-- Politiques tarifs_liaisons
DROP POLICY IF EXISTS "tl_select" ON public.tarifs_liaisons;
CREATE POLICY "tl_select" ON public.tarifs_liaisons FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tl_insert_pdg" ON public.tarifs_liaisons;
CREATE POLICY "tl_insert_pdg" ON public.tarifs_liaisons FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compagnies c WHERE c.id = compagnie_id AND c.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tl_update_pdg" ON public.tarifs_liaisons;
CREATE POLICY "tl_update_pdg" ON public.tarifs_liaisons FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compagnies c WHERE c.id = compagnie_id AND c.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tl_delete_pdg" ON public.tarifs_liaisons;
CREATE POLICY "tl_delete_pdg" ON public.tarifs_liaisons FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compagnies c WHERE c.id = compagnie_id AND c.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tl_admin" ON public.tarifs_liaisons;
CREATE POLICY "tl_admin" ON public.tarifs_liaisons FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Politiques aeroport_passagers (lecture pour tous, modification admin seulement)
DROP POLICY IF EXISTS "ap_select" ON public.aeroport_passagers;
CREATE POLICY "ap_select" ON public.aeroport_passagers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ap_admin" ON public.aeroport_passagers;
CREATE POLICY "ap_admin" ON public.aeroport_passagers FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Initialiser les passagers pour chaque aéroport PTFS
-- La capacité max dépend de la taille de l'aéroport
INSERT INTO public.aeroport_passagers (code_oaci, passagers_disponibles, passagers_max) VALUES
  ('IBAR', 2000, 2000),    -- petit
  ('IHEN', 1500, 1500),    -- petit
  ('ILAR', 15000, 15000),  -- international
  ('IIAB', 3000, 3000),    -- militaire
  ('IPAP', 12000, 12000),  -- international touristique
  ('IGRV', 2000, 2000),    -- petit
  ('IJAF', 5000, 5000),    -- regional
  ('IZOL', 10000, 10000),  -- international
  ('ISCM', 2000, 2000),    -- militaire petit
  ('IBRD', 1000, 1000),    -- très petit
  ('IDCS', 800, 800),      -- très petit (Saba)
  ('ITKO', 25000, 25000),  -- grand international (Tokyo)
  ('ILKL', 500, 500),      -- très petit (Lukla)
  ('IPPH', 18000, 18000),  -- grand international (Perth)
  ('IGAR', 2000, 2000),    -- militaire
  ('IBLT', 3000, 3000),    -- regional
  ('IRFD', 12000, 12000),  -- international
  ('IMLR', 15000, 15000),  -- international
  ('ITRC', 1000, 1000),    -- training petit
  ('IBTH', 4000, 4000),    -- touristique petit
  ('IUFO', 500, 500),      -- secret/petit
  ('ISAU', 8000, 8000),    -- regional
  ('ISKP', 3000, 3000)     -- touristique petit
ON CONFLICT (code_oaci) DO NOTHING;

-- Fonction pour régénérer les passagers (appelée périodiquement ou par trigger)
CREATE OR REPLACE FUNCTION regenerer_passagers_aeroport()
RETURNS void AS $$
BEGIN
  -- Régénère 10% des passagers max par heure écoulée depuis la dernière régénération
  UPDATE public.aeroport_passagers
  SET 
    passagers_disponibles = LEAST(
      passagers_max,
      passagers_disponibles + GREATEST(
        1,
        FLOOR(passagers_max * 0.1 * EXTRACT(EPOCH FROM (now() - derniere_regeneration)) / 3600)
      )::INTEGER
    ),
    derniere_regeneration = now(),
    updated_at = now()
  WHERE EXTRACT(EPOCH FROM (now() - derniere_regeneration)) >= 300; -- Minimum 5 min entre régénérations
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour mettre à jour updated_at sur tarifs_liaisons
CREATE OR REPLACE FUNCTION update_tarifs_liaisons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tarifs_liaisons_updated_at ON public.tarifs_liaisons;
CREATE TRIGGER trigger_tarifs_liaisons_updated_at
  BEFORE UPDATE ON public.tarifs_liaisons
  FOR EACH ROW
  EXECUTE FUNCTION update_tarifs_liaisons_updated_at();

-- Ajouter les colonnes manquantes à plans_vol
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS prix_billet_utilise INTEGER;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS vol_sans_atc BOOLEAN DEFAULT false;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS demande_cloture_at TIMESTAMPTZ;

-- Fonction pour consommer les passagers d'un aéroport
CREATE OR REPLACE FUNCTION consommer_passagers_aeroport(p_code_oaci TEXT, p_passagers INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.aeroport_passagers
  SET 
    passagers_disponibles = GREATEST(0, passagers_disponibles - p_passagers),
    updated_at = now()
  WHERE code_oaci = p_code_oaci;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
