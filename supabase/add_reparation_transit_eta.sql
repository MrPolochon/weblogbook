-- Étapes d'échéance pour transits automatiques (entreprise hangar ↔ base client).

ALTER TABLE public.reparation_demandes
  ADD COLUMN IF NOT EXISTS entreprise_transit_eta_at TIMESTAMPTZ;

ALTER TABLE public.reparation_demandes
  ADD COLUMN IF NOT EXISTS retour_transit_eta_at TIMESTAMPTZ;

COMMENT ON COLUMN public.reparation_demandes.entreprise_transit_eta_at IS
  'Quand le transfert entreprise vers le hangar est considéré terminé (délais aléatoire côté app).';

COMMENT ON COLUMN public.reparation_demandes.retour_transit_eta_at IS
  'Quand le retour automatique vers aeroport_depart_client / hub est considéré terminé.';

-- Débloquer les demandes déjà bloquées en transit avant cette migration
UPDATE public.reparation_demandes
SET entreprise_transit_eta_at = now()
WHERE statut = 'en_transit' AND entreprise_transit_eta_at IS NULL;

UPDATE public.reparation_demandes
SET retour_transit_eta_at = now()
WHERE statut = 'retour_transit' AND retour_transit_eta_at IS NULL;
