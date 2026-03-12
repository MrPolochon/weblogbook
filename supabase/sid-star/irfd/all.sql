-- Toutes les SID IRFD (Rockford) — noms des cartes (BRIA + panel dépôt)
-- À exécuter après ../../add_sid_star.sql

-- LOGAN 4INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'LOGAN 4', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN 4 VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN 4 VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH'),
  ('IRFD', 'SID', 'LOGAN 4.RENDR', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN 4.DINNER', 'logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  ('IRFD', 'SID', 'LOGAN 4.RENDR VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN 4.RENDR VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT RENDR'),
  ('IRFD', 'SID', 'LOGAN 4.DINNER VIA DOCKR', 'dockr dct quran dct exmor dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER'),
  ('IRFD', 'SID', 'LOGAN 4.DINNER VIA DLREY', 'dlrey dct daale dct logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH DCT MDWAY DCT DINNER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- KENED 2INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'KENED 2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IRFD', 'SID', 'KENED 2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IRFD', 'SID', 'KENED 2.JOOPY', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT JOOPY'),
  ('IRFD', 'SID', 'KENED 2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER'),
  ('IRFD', 'SID', 'KENED 2.INDEX', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- DARRK 3INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'DARRK 3', 'darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK 3 VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK 3 VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY'),
  ('IRFD', 'SID', 'DARRK 3.SEEKS', 'darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK 3.SPACE', 'darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  ('IRFD', 'SID', 'DARRK 3.SEEKS VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK 3.SEEKS VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT SEEKS'),
  ('IRFD', 'SID', 'DARRK 3.SPACE VIA DOCKR', 'dockr dct quran dct exmor dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE'),
  ('IRFD', 'SID', 'DARRK 3.SPACE VIA DLREY', 'dlrey dct aloha dct darrk DCT DINTY DCT BEANS DCT RIZIN DCT SPACE')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- OSHNN 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'OSHNN 1', 'oshnn'),
  ('IRFD', 'SID', 'OSHNN 1 VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn'),
  ('IRFD', 'SID', 'OSHNN 1 VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn'),
  ('IRFD', 'SID', 'OSHNN 1.SILVA', 'oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN 1.CYRIL', 'oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN 1.GRASS', 'oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN 1.ARCUS', 'oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN 1.JAMSI', 'oshnn dct jamsi'),
  ('IRFD', 'SID', 'OSHNN 1.SILVA VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN 1.SILVA VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN 1.CYRIL VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN 1.CYRIL VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN 1.GRASS VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN 1.GRASS VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN 1.ARCUS VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN 1.ARCUS VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN 1.JAMSI VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn dct jamsi'),
  ('IRFD', 'SID', 'OSHNN 1.JAMSI VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn dct jamsi')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- TRAINING 1INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'TRAINING 1', 'trn'),
  ('IRFD', 'SID', 'TRAINING 1 VIA DOCKR', 'dockr dct weilr dct trn'),
  ('IRFD', 'SID', 'TRAINING 1 VIA DLREY', 'dlrey dct pepul dct haynk dct trn'),
  ('IRFD', 'SID', 'TRAINING 1.MDWST', 'trn dct mdwst'),
  ('IRFD', 'SID', 'TRAINING 1.GODLU', 'trn dct godlu'),
  ('IRFD', 'SID', 'TRAINING 1.GRASS', 'trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRAINING 1.SILVA', 'trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRAINING 1.CYRIL', 'trn dct atpev dct oceen dct silva dct cyril'),
  ('IRFD', 'SID', 'TRAINING 1.MDWST VIA DOCKR', 'dockr dct weilr dct trn dct mdwst'),
  ('IRFD', 'SID', 'TRAINING 1.MDWST VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct mdwst'),
  ('IRFD', 'SID', 'TRAINING 1.GODLU VIA DOCKR', 'dockr dct weilr dct trn dct godlu'),
  ('IRFD', 'SID', 'TRAINING 1.GODLU VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct godlu'),
  ('IRFD', 'SID', 'TRAINING 1.GRASS VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRAINING 1.GRASS VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRAINING 1.SILVA VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRAINING 1.SILVA VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRAINING 1.CYRIL VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct oceen dct silva dct cyril'),
  ('IRFD', 'SID', 'TRAINING 1.CYRIL VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct oceen dct silva dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- WNNDY 3INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'WNNDY 3', 'wnndy'),
  ('IRFD', 'SID', 'WNNDY 3 VIA MJSTY', 'mjsty dct wnndy'),
  ('IRFD', 'SID', 'WNNDY 3.SILVA', 'wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX', 'wnndy dct greek dct narxx'),
  ('IRFD', 'SID', 'WNNDY 3.SILVA VIA MJSTY', 'mjsty dct wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX VIA MJSTY', 'mjsty dct wnndy dct greek dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ROCKKFORD 6 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'ROCKKFORD 6', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
