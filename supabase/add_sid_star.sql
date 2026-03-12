-- SID/STAR procedures pour remplir automatiquement la route du strip
-- Chaque entrée = une procédure sélectionnable (base, VIA, transition, ou combinaison)

CREATE TABLE IF NOT EXISTS public.sid_star (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport TEXT NOT NULL,
  type_procedure TEXT NOT NULL CHECK (type_procedure IN ('SID', 'STAR')),
  nom TEXT NOT NULL,
  route TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aeroport, type_procedure, nom)
);

CREATE INDEX IF NOT EXISTS idx_sid_star_aeroport_type ON public.sid_star (aeroport, type_procedure);

COMMENT ON TABLE public.sid_star IS 'Procédures SID/STAR par aéroport. La route est utilisée pour remplir strip_route lors du dépôt de plan de vol.';
