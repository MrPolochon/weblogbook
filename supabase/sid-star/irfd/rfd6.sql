-- SID ROCKKFORD 6 (RFD6) — Départ omnidirectionnel
-- Route : RADAR VECTORS DCT (vecteurs radar jusqu'au premier point)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'RFD6', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
