-- SID NARXX 1 et variantes pour IPPH (Perth)
-- NOONU → TALIS → ANTNY → NARXX ; ou via STRAX/TINDR
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'NARXX 1', 'noonu dct talis dct antny dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA STRAX', 'strax dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA TINDR', 'tindr dct strax dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
