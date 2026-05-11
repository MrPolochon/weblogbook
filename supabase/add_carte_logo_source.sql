-- ============================================================
-- Cartes d'identite : choix manuel/auto/compagnie pour le logo
-- ============================================================
-- Permet a un utilisateur (notamment s'il est dans plusieurs
-- compagnies) de choisir quel logo apparait sur sa carte.
--
-- logo_source = 'auto'     -> calcule automatiquement (PDG > premier employeur)
--             = 'compagnie'-> utilise le logo de logo_compagnie_id
--             = 'manuel'   -> logo_url est fige (uploade via /api/cartes/upload)
--             = 'aucun'    -> pas de logo affiche
-- ============================================================

ALTER TABLE public.cartes_identite
  ADD COLUMN IF NOT EXISTS logo_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (logo_source IN ('auto', 'compagnie', 'manuel', 'aucun')),
  ADD COLUMN IF NOT EXISTS logo_compagnie_id UUID
    REFERENCES public.compagnies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cartes_identite.logo_source IS
  'Mode de calcul du logo : auto (PDG > 1er employeur), compagnie (logo_compagnie_id), manuel (logo_url fige), aucun.';
COMMENT ON COLUMN public.cartes_identite.logo_compagnie_id IS
  'Si logo_source = ''compagnie'', identifie la compagnie dont on prend le logo.';

CREATE INDEX IF NOT EXISTS idx_cartes_identite_logo_compagnie
  ON public.cartes_identite(logo_compagnie_id)
  WHERE logo_compagnie_id IS NOT NULL;

-- Backfill : si l'ancienne colonne logo_url contient une URL qui correspond
-- au logo d'une compagnie connue, on bascule en mode 'compagnie' et on lie
-- la bonne compagnie (et on garde 'auto' sinon).
UPDATE public.cartes_identite ci
SET logo_source = 'compagnie',
    logo_compagnie_id = c.id
FROM public.compagnies c
WHERE ci.logo_url IS NOT NULL
  AND ci.logo_url = c.logo_url
  AND ci.logo_source = 'auto'
  AND ci.logo_compagnie_id IS NULL;
