-- Aéroport de l’avion au moment de la demande (cible légale du « ferry retour » après réparation).
ALTER TABLE public.reparation_demandes
  ADD COLUMN IF NOT EXISTS aeroport_depart_client TEXT;

COMMENT ON COLUMN public.reparation_demandes.aeroport_depart_client IS
  'Aéroport (OACI) où se trouvait l’avion à la demande ; destination du vol ferry retour.';
