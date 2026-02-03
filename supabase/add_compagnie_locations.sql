-- Location d'avions entre compagnies
-- Exécuter dans l'éditeur SQL Supabase

CREATE TABLE IF NOT EXISTS public.compagnie_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  loueur_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  locataire_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  prix_journalier INTEGER NOT NULL,
  pourcentage_revenu_loueur INTEGER NOT NULL,
  duree_jours INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  last_billed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_compagnie_locations_avion ON public.compagnie_locations(avion_id);
CREATE INDEX IF NOT EXISTS idx_compagnie_locations_loueur ON public.compagnie_locations(loueur_compagnie_id, statut);
CREATE INDEX IF NOT EXISTS idx_compagnie_locations_locataire ON public.compagnie_locations(locataire_compagnie_id, statut);

ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.compagnie_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_loueur_compagnie_id UUID REFERENCES public.compagnies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_pourcentage_revenu_loueur INTEGER,
  ADD COLUMN IF NOT EXISTS location_prix_journalier INTEGER;
