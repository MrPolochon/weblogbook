-- SID LETSE 1 et variantes pour ITKO (Haneda Tokyo)
-- LETSE → HONDA → KNIFE, puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'LETSE 1', 'letse dct honda dct knife'),
  ('ITKO', 'SID', 'LETSE 1.DINER', 'letse dct honda dct knife dct diner'),
  ('ITKO', 'SID', 'LETSE 1.RENDR', 'letse dct honda dct knife dct onder dct rendr'),
  ('ITKO', 'SID', 'LETSE 1.PROBE', 'letse dct honda dct knife dct onder dct probe')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
