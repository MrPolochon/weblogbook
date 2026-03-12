-- SID ODOKU 1 et variantes pour ILAR (Larnaca)
-- GRASS → LAZER → ODOKU ; ou DIDDY → SAMPA → ODOKU
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'ODOKU 1', 'grass dct lazer dct odoku'),
  ('ILAR', 'SID', 'ODOKU 1 VIA DIDDY', 'diddy dct sampa dct odoku')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
