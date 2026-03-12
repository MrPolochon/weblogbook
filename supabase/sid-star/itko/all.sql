-- Toutes les SID ITKO (Haneda Tokyo) — noms des cartes (BRIA + panel dépôt)
-- À exécuter après ../../add_sid_star.sql

-- TOKYO 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'TOKYO 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ASTRO 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ASTRO 1', 'VECTORS FOR ASTRO1 ASTRO'),
  ('ITKO', 'SID', 'ASTRO 1.BLANK', 'VECTORS FOR ASTRO1 ASTRO DCT GULEG'),
  ('ITKO', 'SID', 'ASTRO 1.ONDER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER'),
  ('ITKO', 'SID', 'ASTRO 1.PROBE', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT PROBE'),
  ('ITKO', 'SID', 'ASTRO 1.DINER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- HONDA 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'HONDA 1', 'honda'),
  ('ITKO', 'SID', 'HONDA 1 VIA LETSE', 'letse dct honda')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- LETSE 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'LETSE 1', 'letse dct honda dct knife'),
  ('ITKO', 'SID', 'LETSE 1.DINER', 'letse dct honda dct knife dct diner'),
  ('ITKO', 'SID', 'LETSE 1.RENDR', 'letse dct honda dct knife dct onder dct rendr'),
  ('ITKO', 'SID', 'LETSE 1.PROBE', 'letse dct honda dct knife dct onder dct probe')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ONDER 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ONDER 1', 'onder'),
  ('ITKO', 'SID', 'ONDER 1.PROBE', 'onder dct probe'),
  ('ITKO', 'SID', 'ONDER 1.DINER', 'onder dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
