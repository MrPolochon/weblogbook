-- Toutes les SID ILAR (Larnaca) — LARNACA 1, GRASS 1, ODOKU 1, RENTS 1
-- À exécuter après ../../add_sid_star.sql

-- LARNACA 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'LARNACA 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- GRASS 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'GRASS 1', 'diddy dct swift dct grass'),
  ('ILAR', 'SID', 'GRASS 1.ANYMS', 'diddy dct swift dct grass dct anyms'),
  ('ILAR', 'SID', 'GRASS 1.RENTS', 'diddy dct swift dct grass dct rents')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ODOKU 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'ODOKU 1', 'grass dct lazer dct odoku'),
  ('ILAR', 'SID', 'ODOKU 1 VIA DIDDY', 'diddy dct sampa dct odoku')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- RENTS 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'RENTS 1', 'rents'),
  ('ILAR', 'SID', 'RENTS 1.CAWZE', 'rents dct cawze'),
  ('ILAR', 'SID', 'RENTS 1.ANYMS', 'rents dct anyms'),
  ('ILAR', 'SID', 'RENTS 1.JUSTY', 'rents dct justy')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
