-- SID GRASS 1 et variantes pour ILAR (Larnaca)
-- DIDDY → SWIFT → GRASS ; transitions ANYMS, RENTS
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'GRASS 1', 'diddy dct swift dct grass'),
  ('ILAR', 'SID', 'GRASS 1.ANYMS', 'diddy dct swift dct grass dct anyms'),
  ('ILAR', 'SID', 'GRASS 1.RENTS', 'diddy dct swift dct grass dct rents')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
