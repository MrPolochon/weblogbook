-- SID DARRK 3 et toutes les variantes pour IRFD (Rockford)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à DINTY)
  ('IRFD', 'SID', 'DARRK3', 'darrk DCT DINTY'),
  
  -- VIA (entrée) — Rwy 25L: DOCKR, Rwy 25C/R: DLREY
  ('IRFD', 'SID', 'DARRK3 VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK3 VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY'),
  
  -- Transitions (sortie depuis DINTY)
  ('IRFD', 'SID', 'DARRK3.SEEKS', 'darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SPACE', 'darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  
  -- VIA + Transition (combinaisons)
  ('IRFD', 'SID', 'DARRK3.SEEKS VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SEEKS VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SPACE VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  ('IRFD', 'SID', 'DARRK3.SPACE VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
