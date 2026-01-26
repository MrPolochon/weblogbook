-- ============================================================
-- FIX: Corriger la table compagnie_avions
-- ============================================================

-- Vérifier si la colonne type_avion_id existe, sinon l'ajouter
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'compagnie_avions' 
    AND column_name = 'type_avion_id'
  ) THEN
    -- Vérifier si la table existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnie_avions') THEN
      -- Ajouter la colonne
      ALTER TABLE public.compagnie_avions 
        ADD COLUMN type_avion_id UUID REFERENCES public.types_avion(id) ON DELETE CASCADE;
      RAISE NOTICE 'Colonne type_avion_id ajoutée';
    ELSE
      RAISE NOTICE 'Table compagnie_avions n existe pas - creation...';
    END IF;
  ELSE
    RAISE NOTICE 'Colonne type_avion_id existe deja';
  END IF;
END $$;

-- Recréer la table si elle n'existe pas avec la bonne structure
CREATE TABLE IF NOT EXISTS public.compagnie_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE CASCADE,
  immatriculation TEXT NOT NULL UNIQUE,
  nom_bapteme TEXT,
  usure_percent INTEGER NOT NULL DEFAULT 100 CHECK (usure_percent >= 0 AND usure_percent <= 100),
  aeroport_actuel TEXT NOT NULL DEFAULT 'IRFD',
  statut TEXT NOT NULL DEFAULT 'ground' CHECK (statut IN ('ground', 'in_flight', 'maintenance', 'bloque')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- S'assurer que la colonne est NOT NULL (si elle était nullable)
-- D'abord on vérifie s'il y a des valeurs NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'compagnie_avions' 
    AND column_name = 'type_avion_id'
    AND is_nullable = 'YES'
  ) THEN
    -- Supprimer les lignes sans type_avion_id
    DELETE FROM public.compagnie_avions WHERE type_avion_id IS NULL;
    -- Rendre NOT NULL
    ALTER TABLE public.compagnie_avions ALTER COLUMN type_avion_id SET NOT NULL;
    RAISE NOTICE 'Colonne type_avion_id mise a NOT NULL';
  END IF;
END $$;

-- Activer RLS
ALTER TABLE public.compagnie_avions ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "compagnie_avions_select" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_select" ON public.compagnie_avions 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compagnie_avions_insert" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_insert" ON public.compagnie_avions 
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

DROP POLICY IF EXISTS "compagnie_avions_update" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_update" ON public.compagnie_avions 
  FOR UPDATE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

DROP POLICY IF EXISTS "compagnie_avions_delete" ON public.compagnie_avions;
CREATE POLICY "compagnie_avions_delete" ON public.compagnie_avions 
  FOR DELETE TO authenticated USING (
    public.is_admin() OR 
    EXISTS (SELECT 1 FROM public.compagnies WHERE id = compagnie_id AND pdg_id = auth.uid())
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_compagnie ON public.compagnie_avions(compagnie_id);
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_type ON public.compagnie_avions(type_avion_id);

-- Afficher la structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'compagnie_avions'
ORDER BY ordinal_position;
