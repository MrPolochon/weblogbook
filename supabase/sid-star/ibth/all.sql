-- Toutes les SID IBTH (Saint Barthelemy) — SBH1, MONTN1, OCEAN1, RES1, VOX1
-- À exécuter après ../../add_sid_star.sql

-- BARTHELEMY 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'BARTHELEMY 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- MOUNTAIN 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'MOUNTAIN 1', 'vox'),
  ('IBTH', 'SID', 'MOUNTAIN 1.DINER', 'vox dct rom dct diner'),
  ('IBTH', 'SID', 'MOUNTAIN 1.OCEEN', 'vox dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- OCEAN 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'OCEAN 1', 'res'),
  ('IBTH', 'SID', 'OCEAN 1.DINER', 'res dct diner'),
  ('IBTH', 'SID', 'OCEAN 1.ROM', 'res dct diner dct rom'),
  ('IBTH', 'SID', 'OCEAN 1.OCEEN', 'res dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- RESURGE 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'RESURGE 1', 'res'),
  ('IBTH', 'SID', 'RESURGE 1.INDEX', 'res dct index'),
  ('IBTH', 'SID', 'RESURGE 1.WELSH', 'res dct index dct welsh'),
  ('IBTH', 'SID', 'RESURGE 1.PROBE', 'res dct index dct welsh dct probe'),
  ('IBTH', 'SID', 'RESURGE 1.PIPER', 'res dct index dct welsh dct probe dct piper'),
  ('IBTH', 'SID', 'RESURGE 1.EASTN', 'res dct eastn')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- VONARX 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'VONARX 1', 'vox'),
  ('IBTH', 'SID', 'VONARX 1.TALIS', 'vox dct talis'),
  ('IBTH', 'SID', 'VONARX 1.CAMEL', 'vox dct camel'),
  ('IBTH', 'SID', 'VONARX 1.DUNKS', 'vox dct camel dct dunks'),
  ('IBTH', 'SID', 'VONARX 1.CYRIL', 'vox dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
