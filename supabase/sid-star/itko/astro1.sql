-- SID ASTRO 1 et variantes pour ITKO (Haneda Tokyo)
-- VECTORS vers ASTRO, puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ASTRO 1', 'VECTORS FOR ASTRO1 ASTRO'),
  ('ITKO', 'SID', 'ASTRO 1.BLANK', 'VECTORS FOR ASTRO1 ASTRO DCT GULEG'),
  ('ITKO', 'SID', 'ASTRO 1.ONDER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER'),
  ('ITKO', 'SID', 'ASTRO 1.PROBE', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT PROBE'),
  ('ITKO', 'SID', 'ASTRO 1.DINER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
