-- SID CAMEL 2 et variantes pour IPPH (Perth)
-- NOONU → TALIS → CAMEL ; ou STRAX ; ou TINDR
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'CAMEL 2', 'noonu dct talis dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA STRAX', 'strax dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA TINDR', 'tindr dct strax dct camel')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
