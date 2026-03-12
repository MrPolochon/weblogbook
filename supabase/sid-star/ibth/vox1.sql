-- SID VONARX 1 et variantes pour IBTH (Saint Barthelemy)
-- VOX VOR (085° depuis RW09), puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'VONARX 1', 'vox'),
  ('IBTH', 'SID', 'VONARX 1.TALIS', 'vox dct talis'),
  ('IBTH', 'SID', 'VONARX 1.CAMEL', 'vox dct camel'),
  ('IBTH', 'SID', 'VONARX 1.DUNKS', 'vox dct camel dct dunks'),
  ('IBTH', 'SID', 'VONARX 1.CYRIL', 'vox dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
