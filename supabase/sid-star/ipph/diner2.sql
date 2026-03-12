-- SID DINER 2 et variantes pour IPPH (Perth)
-- NOONU → TALIS → ANTNY → ROMNS → DINER ; ou via STRAX/TINDR
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'DINER 2', 'noonu dct talis dct antny dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA STRAX', 'strax dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA TINDR', 'tindr dct strax dct romns dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
