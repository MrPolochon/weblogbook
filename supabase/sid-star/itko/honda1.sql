-- SID HONDA 1 pour ITKO (Haneda Tokyo)
-- Rwy 02: LETSE → HONDA | Rwy 20: direct HONDA
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'HONDA 1', 'honda'),
  ('ITKO', 'SID', 'HONDA 1 VIA LETSE', 'letse dct honda')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
