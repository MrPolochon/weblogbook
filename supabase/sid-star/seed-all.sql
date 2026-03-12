-- Seed toutes les SID/STAR de tous les aéroports
-- À exécuter après supabase/add_sid_star.sql
-- Compatible Supabase SQL Editor (pas de \i)

-- ========== IRFD (Rockford) ==========
-- Noms = identifiants des cartes (BRIA + panel dépôt plan de vol)
-- LOGAN 4
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
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

-- KENED 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'KENED 2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IRFD', 'SID', 'KENED 2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IRFD', 'SID', 'KENED 2.JOOPY', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT JOOPY'),
  ('IRFD', 'SID', 'KENED 2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER'),
  ('IRFD', 'SID', 'KENED 2.INDEX', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- DARRK 3
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
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

-- OSHNN 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
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

-- TRAINING 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
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

-- WNNDY 3
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
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

-- ========== ITKO (Haneda Tokyo) ==========
-- Noms = identifiants des cartes (BRIA + panel dépôt plan de vol)
-- TOKYO 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'TOKYO 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ASTRO 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ASTRO 1', 'VECTORS FOR ASTRO1 ASTRO'),
  ('ITKO', 'SID', 'ASTRO 1.BLANK', 'VECTORS FOR ASTRO1 ASTRO DCT GULEG'),
  ('ITKO', 'SID', 'ASTRO 1.ONDER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER'),
  ('ITKO', 'SID', 'ASTRO 1.PROBE', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT PROBE'),
  ('ITKO', 'SID', 'ASTRO 1.DINER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- HONDA 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'HONDA 1', 'honda'),
  ('ITKO', 'SID', 'HONDA 1 VIA LETSE', 'letse dct honda')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- LETSE 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'LETSE 1', 'letse dct honda dct knife'),
  ('ITKO', 'SID', 'LETSE 1.DINER', 'letse dct honda dct knife dct diner'),
  ('ITKO', 'SID', 'LETSE 1.RENDR', 'letse dct honda dct knife dct onder dct rendr'),
  ('ITKO', 'SID', 'LETSE 1.PROBE', 'letse dct honda dct knife dct onder dct probe')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ONDER 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ONDER 1', 'onder'),
  ('ITKO', 'SID', 'ONDER 1.PROBE', 'onder dct probe'),
  ('ITKO', 'SID', 'ONDER 1.DINER', 'onder dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IBTH (Saint Barthelemy) ==========
-- Noms = identifiants des cartes (BRIA + panel dépôt plan de vol)
-- BARTHELEMY 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'BARTHELEMY 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- MOUNTAIN 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'MOUNTAIN 1', 'vox'),
  ('IBTH', 'SID', 'MOUNTAIN 1.DINER', 'vox dct rom dct diner'),
  ('IBTH', 'SID', 'MOUNTAIN 1.OCEEN', 'vox dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- OCEAN 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'OCEAN 1', 'res'),
  ('IBTH', 'SID', 'OCEAN 1.DINER', 'res dct diner'),
  ('IBTH', 'SID', 'OCEAN 1.ROM', 'res dct diner dct rom'),
  ('IBTH', 'SID', 'OCEAN 1.OCEEN', 'res dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- RESURGE 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'RESURGE 1', 'res'),
  ('IBTH', 'SID', 'RESURGE 1.INDEX', 'res dct index'),
  ('IBTH', 'SID', 'RESURGE 1.WELSH', 'res dct index dct welsh'),
  ('IBTH', 'SID', 'RESURGE 1.PROBE', 'res dct index dct welsh dct probe'),
  ('IBTH', 'SID', 'RESURGE 1.PIPER', 'res dct index dct welsh dct probe dct piper'),
  ('IBTH', 'SID', 'RESURGE 1.EASTN', 'res dct eastn')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- VONARX 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'VONARX 1', 'vox'),
  ('IBTH', 'SID', 'VONARX 1.TALIS', 'vox dct talis'),
  ('IBTH', 'SID', 'VONARX 1.CAMEL', 'vox dct camel'),
  ('IBTH', 'SID', 'VONARX 1.DUNKS', 'vox dct camel dct dunks'),
  ('IBTH', 'SID', 'VONARX 1.CYRIL', 'vox dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPPH (Perth) ==========
-- Noms = identifiants des cartes (BRIA + panel dépôt plan de vol)
-- PERTH 2 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'PERTH 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- CAMEL 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'CAMEL 2', 'noonu dct talis dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA STRAX', 'strax dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA TINDR', 'tindr dct strax dct camel')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- DINER 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'DINER 2', 'noonu dct talis dct antny dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA STRAX', 'strax dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA TINDR', 'tindr dct strax dct romns dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- NARXX 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'NARXX 1', 'noonu dct talis dct antny dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA STRAX', 'strax dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA TINDR', 'tindr dct strax dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ILAR (Larnaca) ==========
-- Noms = identifiants des cartes (BRIA + panel dépôt plan de vol)
-- LARNACA 1 (omnidirectionnel)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'LARNACA 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- GRASS 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'GRASS 1', 'diddy dct swift dct grass'),
  ('ILAR', 'SID', 'GRASS 1.ANYMS', 'diddy dct swift dct grass dct anyms'),
  ('ILAR', 'SID', 'GRASS 1.RENTS', 'diddy dct swift dct grass dct rents')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ODOKU 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'ODOKU 1', 'grass dct lazer dct odoku'),
  ('ILAR', 'SID', 'ODOKU 1 VIA DIDDY', 'diddy dct sampa dct odoku')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- RENTS 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'RENTS 1', 'rents'),
  ('ILAR', 'SID', 'RENTS 1.CAWZE', 'rents dct cawze'),
  ('ILAR', 'SID', 'RENTS 1.ANYMS', 'rents dct anyms'),
  ('ILAR', 'SID', 'RENTS 1.JUSTY', 'rents dct justy')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== Autres aéroports (KORD, KLAX, etc.) ==========
