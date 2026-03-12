-- SID RESURGE 1 et variantes pour IBTH (Saint Barthelemy)
-- RES VOR (273° depuis RW27), puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'RESURGE 1', 'res'),
  ('IBTH', 'SID', 'RESURGE 1.INDEX', 'res dct index'),
  ('IBTH', 'SID', 'RESURGE 1.WELSH', 'res dct index dct welsh'),
  ('IBTH', 'SID', 'RESURGE 1.PROBE', 'res dct index dct welsh dct probe'),
  ('IBTH', 'SID', 'RESURGE 1.PIPER', 'res dct index dct welsh dct probe dct piper'),
  ('IBTH', 'SID', 'RESURGE 1.EASTN', 'res dct eastn')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
