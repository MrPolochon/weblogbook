-- SID KENED 2 et toutes les variantes pour IRFD (Rockford)
-- Vecteurs radar initiaux vers KUNAV, puis route publiée
-- À exécuter après add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à KENED)
  ('IRFD', 'SID', 'KENED2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  
  -- Transitions (sortie depuis KENED)
  ('IRFD', 'SID', 'KENED2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IRFD', 'SID', 'KENED2.JOOPY', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT JOOPY'),
  ('IRFD', 'SID', 'KENED2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER'),
  ('IRFD', 'SID', 'KENED2.INDEX', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
