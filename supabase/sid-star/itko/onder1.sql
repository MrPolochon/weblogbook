-- SID ONDER 1 et variantes pour ITKO (Haneda Tokyo)
-- Direct ONDER depuis Rwy 13/20, puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ONDER 1', 'onder'),
  ('ITKO', 'SID', 'ONDER 1.PROBE', 'onder dct probe'),
  ('ITKO', 'SID', 'ONDER 1.DINER', 'onder dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
