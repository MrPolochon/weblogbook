-- Mise à jour des routes SID/STAR IRFD
-- Exécuter dans Supabase SQL Editor pour corriger toutes les routes
-- (MDWAY DCT DINNER, PEVEE dans OSHNN1, etc.)

-- LOGAN 4
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'LOGAN4', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN4 VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN4 VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN4.RENDR', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.DINNER', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  ('IRFD', 'SID', 'LOGAN4.RENDR VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.RENDR VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN4.DINNER VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  ('IRFD', 'SID', 'LOGAN4.DINNER VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- KENED 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'KENED2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IRFD', 'SID', 'KENED2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IRFD', 'SID', 'KENED2.JOOPY', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT JOOPY'),
  ('IRFD', 'SID', 'KENED2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER'),
  ('IRFD', 'SID', 'KENED2.INDEX', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- DARRK 3
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'DARRK3', 'darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK3 VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK3 VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK3.SEEKS', 'darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SPACE', 'darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  ('IRFD', 'SID', 'DARRK3.SEEKS VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SEEKS VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK3.SPACE VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  ('IRFD', 'SID', 'DARRK3.SPACE VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- OSHNN 1 (avec PEVEE)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'OSHNN1', 'oshnn'),
  ('IRFD', 'SID', 'OSHNN1 VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn'),
  ('IRFD', 'SID', 'OSHNN1 VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn'),
  ('IRFD', 'SID', 'OSHNN1.SILVA', 'oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN1.CYRIL', 'oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN1.GRASS', 'oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN1.ARCUS', 'oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN1.JAMSI', 'oshnn dct jamsi'),
  ('IRFD', 'SID', 'OSHNN1.SILVA VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN1.SILVA VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN1.CYRIL VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN1.CYRIL VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN1.GRASS VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN1.GRASS VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN1.ARCUS VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN1.ARCUS VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN1.JAMSI VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct jamsi'),
  ('IRFD', 'SID', 'OSHNN1.JAMSI VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct jamsi')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ROCKKFORD 6 (départ omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'RFD6', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
