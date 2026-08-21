-- Panneau C'est résolu / staff / Fermer : une seule offre par ticket (jusqu'à un clic).

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS resolution_offered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.support_tickets.resolution_offered IS
  'True after the IA posted the C''est résolu / staff / Fermer button panel; prevents repeating it.';
