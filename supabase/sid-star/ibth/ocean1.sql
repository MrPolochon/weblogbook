-- SID OCEAN 1 et variantes pour IBTH (Saint Barthelemy)
-- RES VOR (273° depuis RW27), puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'OCEAN 1', 'res'),
  ('IBTH', 'SID', 'OCEAN 1.DINER', 'res dct diner'),
  ('IBTH', 'SID', 'OCEAN 1.ROM', 'res dct diner dct rom'),
  ('IBTH', 'SID', 'OCEAN 1.OCEEN', 'res dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
