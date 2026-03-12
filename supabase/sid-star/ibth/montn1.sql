-- SID MOUNTAIN 1 et variantes pour IBTH (Saint Barthelemy)
-- VOX VOR (085° depuis RW09), puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'MOUNTAIN 1', 'vox'),
  ('IBTH', 'SID', 'MOUNTAIN 1.DINER', 'vox dct rom dct diner'),
  ('IBTH', 'SID', 'MOUNTAIN 1.OCEEN', 'vox dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
