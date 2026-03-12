-- SID LARNACA 1 — Départ omnidirectionnel (ILAR Larnaca)
-- Route : RADAR VECTORS DCT
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'LARNACA 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
