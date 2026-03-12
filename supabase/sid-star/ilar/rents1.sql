-- SID RENTS 1 et variantes pour ILAR (Larnaca)
-- Direct RENTS ; transitions CAWZE, ANYMS, JUSTY
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'RENTS 1', 'rents'),
  ('ILAR', 'SID', 'RENTS 1.CAWZE', 'rents dct cawze'),
  ('ILAR', 'SID', 'RENTS 1.ANYMS', 'rents dct anyms'),
  ('ILAR', 'SID', 'RENTS 1.JUSTY', 'rents dct justy')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
