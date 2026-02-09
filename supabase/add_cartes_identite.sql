-- Système de cartes d'identité personnalisables
-- Exécuter dans l'éditeur SQL Supabase

-- Table des cartes d'identité
CREATE TABLE IF NOT EXISTS public.cartes_identite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Apparence
  couleur_fond TEXT NOT NULL DEFAULT '#DC2626', -- Rouge par défaut
  logo_url TEXT, -- URL du logo (IFSA, compagnie, etc.)
  photo_url TEXT, -- URL de la photo de profil
  
  -- Textes personnalisables
  titre TEXT NOT NULL DEFAULT 'IFSA', -- Titre en haut de la carte
  sous_titre TEXT DEFAULT 'délivré par l''instance de l''IFSA',
  nom_affiche TEXT, -- Nom affiché sur la carte
  organisation TEXT DEFAULT 'IFSA',
  numero_carte TEXT, -- Numéro de carte (000 00 000001)
  date_delivrance DATE DEFAULT CURRENT_DATE,
  date_expiration DATE,
  
  -- Cases du haut (qualifications)
  cases_haut TEXT[] DEFAULT ARRAY[]::TEXT[], -- Ex: ['TRA', 'MAN', 'ITB', 'NAV']
  
  -- Cases du bas (catégories)
  cases_bas TEXT[] DEFAULT ARRAY[]::TEXT[], -- Ex: ['A', 'B', 'F', 'P']
  
  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cartes_identite_user ON public.cartes_identite(user_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_cartes_identite_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cartes_identite_updated_at ON public.cartes_identite;
CREATE TRIGGER trigger_cartes_identite_updated_at
  BEFORE UPDATE ON public.cartes_identite
  FOR EACH ROW
  EXECUTE FUNCTION update_cartes_identite_updated_at();

-- RLS
ALTER TABLE public.cartes_identite ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut voir les cartes
CREATE POLICY "cartes_select_all" ON public.cartes_identite FOR SELECT TO authenticated
  USING (true);

-- Seuls les admins et IFSA peuvent créer des cartes
CREATE POLICY "cartes_insert_admin_ifsa" ON public.cartes_identite FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
    )
  );

-- Seuls les admins et IFSA peuvent modifier les cartes
CREATE POLICY "cartes_update_admin_ifsa" ON public.cartes_identite FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'ifsa' OR ifsa = true)
    )
  );

-- Seuls les admins peuvent supprimer les cartes
CREATE POLICY "cartes_delete_admin" ON public.cartes_identite FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );
