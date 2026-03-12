-- Toutes les SID IPPH (Perth) — PERTH 2, CAMEL 2, DINER 2, NARXX 1
-- À exécuter après ../../add_sid_star.sql

-- PERTH 2 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'PERTH 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- CAMEL 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'CAMEL 2', 'noonu dct talis dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA STRAX', 'strax dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA TINDR', 'tindr dct strax dct camel')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- DINER 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'DINER 2', 'noonu dct talis dct antny dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA STRAX', 'strax dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA TINDR', 'tindr dct strax dct romns dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- NARXX 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'NARXX 1', 'noonu dct talis dct antny dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA STRAX', 'strax dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA TINDR', 'tindr dct strax dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
