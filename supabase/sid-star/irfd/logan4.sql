-- SID LOGAN 4 et toutes les variantes pour IRFD (Greater Rockford)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base
  ('IRFD', 'SID', 'LOGAN4', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  
  -- VIA (entrée)
  ('IRFD', 'SID', 'LOGAN4 VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN4 VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  
  -- Transitions (sortie)
  ('IRFD', 'SID', 'LOGAN4.RENDR', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.DINNER', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  
  -- VIA + Transition (combinaisons)
  ('IRFD', 'SID', 'LOGAN4.RENDR VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.RENDR VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.DINNER VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  ('IRFD', 'SID', 'LOGAN4.DINNER VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
