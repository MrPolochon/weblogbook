-- =============================================================================
-- SID/STAR COMPLET — Tout en un seul fichier
-- Exécuter ce fichier dans Supabase SQL Editor pour créer/mettre à jour toutes
-- les procédures SID et STAR (IRFD, ITKO, IBTH, IPPH, ILAR, IIAB, IGRV, IMLR, IPAP, ISAU)
-- =============================================================================

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.sid_star (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport TEXT NOT NULL,
  type_procedure TEXT NOT NULL CHECK (type_procedure IN ('SID', 'STAR')),
  nom TEXT NOT NULL,
  route TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aeroport, type_procedure, nom)
);

CREATE INDEX IF NOT EXISTS idx_sid_star_aeroport_type ON public.sid_star (aeroport, type_procedure);

COMMENT ON TABLE public.sid_star IS 'Procédures SID/STAR par aéroport. La route est utilisée pour remplir strip_route lors du dépôt de plan de vol.';

-- =============================================================================
-- 2. SEED ALL (IRFD, ITKO, IBTH, IPPH, ILAR)
-- =============================================================================

-- ========== IRFD (Rockford) ==========
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

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'KENED 2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IRFD', 'SID', 'KENED 2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IRFD', 'SID', 'KENED 2.JOOPY', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT JOOPY'),
  ('IRFD', 'SID', 'KENED 2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER'),
  ('IRFD', 'SID', 'KENED 2.INDEX', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

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

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'WNNDY 3', 'wnndy'),
  ('IRFD', 'SID', 'WNNDY 3 VIA MJSTY', 'mjsty dct wnndy'),
  ('IRFD', 'SID', 'WNNDY 3.SILVA', 'wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX', 'wnndy dct greek dct narxx'),
  ('IRFD', 'SID', 'WNNDY 3.SILVA VIA MJSTY', 'mjsty dct wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX VIA MJSTY', 'mjsty dct wnndy dct greek dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'SID', 'ROCKKFORD 6', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ITKO (Tokyo) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'TOKYO 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ASTRO 1', 'VECTORS FOR ASTRO1 ASTRO'),
  ('ITKO', 'SID', 'ASTRO 1.BLANK', 'VECTORS FOR ASTRO1 ASTRO DCT GULEG'),
  ('ITKO', 'SID', 'ASTRO 1.ONDER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER'),
  ('ITKO', 'SID', 'ASTRO 1.PROBE', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT PROBE'),
  ('ITKO', 'SID', 'ASTRO 1.DINER', 'VECTORS FOR ASTRO1 ASTRO DCT PIPER DCT ONDER DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'HONDA 1', 'honda'),
  ('ITKO', 'SID', 'HONDA 1 VIA LETSE', 'letse dct honda')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'LETSE 1', 'letse dct honda dct knife'),
  ('ITKO', 'SID', 'LETSE 1.DINER', 'letse dct honda dct knife dct diner'),
  ('ITKO', 'SID', 'LETSE 1.RENDR', 'letse dct honda dct knife dct onder dct rendr'),
  ('ITKO', 'SID', 'LETSE 1.PROBE', 'letse dct honda dct knife dct onder dct probe')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'SID', 'ONDER 1', 'onder'),
  ('ITKO', 'SID', 'ONDER 1.PROBE', 'onder dct probe'),
  ('ITKO', 'SID', 'ONDER 1.DINER', 'onder dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IBTH (Saint Barthelemy) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'BARTHELEMY 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'MOUNTAIN 1', 'vox'),
  ('IBTH', 'SID', 'MOUNTAIN 1.DINER', 'vox dct rom dct diner'),
  ('IBTH', 'SID', 'MOUNTAIN 1.OCEEN', 'vox dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'OCEAN 1', 'res'),
  ('IBTH', 'SID', 'OCEAN 1.DINER', 'res dct diner'),
  ('IBTH', 'SID', 'OCEAN 1.ROM', 'res dct diner dct rom'),
  ('IBTH', 'SID', 'OCEAN 1.OCEEN', 'res dct oceen')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'RESURGE 1', 'res'),
  ('IBTH', 'SID', 'RESURGE 1.INDEX', 'res dct index'),
  ('IBTH', 'SID', 'RESURGE 1.WELSH', 'res dct index dct welsh'),
  ('IBTH', 'SID', 'RESURGE 1.PROBE', 'res dct index dct welsh dct probe'),
  ('IBTH', 'SID', 'RESURGE 1.PIPER', 'res dct index dct welsh dct probe dct piper'),
  ('IBTH', 'SID', 'RESURGE 1.EASTN', 'res dct eastn')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'SID', 'VONARX 1', 'vox'),
  ('IBTH', 'SID', 'VONARX 1.TALIS', 'vox dct talis'),
  ('IBTH', 'SID', 'VONARX 1.CAMEL', 'vox dct camel'),
  ('IBTH', 'SID', 'VONARX 1.DUNKS', 'vox dct camel dct dunks'),
  ('IBTH', 'SID', 'VONARX 1.CYRIL', 'vox dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPPH (Perth) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'PERTH 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'CAMEL 2', 'noonu dct talis dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA STRAX', 'strax dct camel'),
  ('IPPH', 'SID', 'CAMEL 2 VIA TINDR', 'tindr dct strax dct camel')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'DINER 2', 'noonu dct talis dct antny dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA STRAX', 'strax dct romns dct diner'),
  ('IPPH', 'SID', 'DINER 2 VIA TINDR', 'tindr dct strax dct romns dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'SID', 'NARXX 1', 'noonu dct talis dct antny dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA STRAX', 'strax dct narxx'),
  ('IPPH', 'SID', 'NARXX 1 VIA TINDR', 'tindr dct strax dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ILAR (Larnaca) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'LARNACA 1', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'GRASS 1', 'diddy dct swift dct grass'),
  ('ILAR', 'SID', 'GRASS 1.ANYMS', 'diddy dct swift dct grass dct anyms'),
  ('ILAR', 'SID', 'GRASS 1.RENTS', 'diddy dct swift dct grass dct rents')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'ODOKU 1', 'grass dct lazer dct odoku'),
  ('ILAR', 'SID', 'ODOKU 1 VIA DIDDY', 'diddy dct sampa dct odoku')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'SID', 'RENTS 1', 'rents'),
  ('ILAR', 'SID', 'RENTS 1.CAWZE', 'rents dct cawze'),
  ('ILAR', 'SID', 'RENTS 1.ANYMS', 'rents dct anyms'),
  ('ILAR', 'SID', 'RENTS 1.JUSTY', 'rents dct justy')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- =============================================================================
-- 3. SID RESTANTS (IIAB, IGRV, IMLR, IPAP, ISAU)
-- =============================================================================

-- ========== IIAB (McConnell AFB) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'SID', 'MCCONNELL 1', 'mcconnell'),
  ('IIAB', 'SID', 'MCCONNELL 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IGRV (Grindavik) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'CELAR 4', 'gvk dct celar'),
  ('IGRV', 'SID', 'GRINDAVIK 1', 'gvk dct grindavik'),
  ('IGRV', 'SID', 'HAWKN 1', 'gvk dct hawkin'),
  ('IGRV', 'SID', 'THENR 3', 'gvk dct thenr'),
  ('IGRV', 'SID', 'YOUTH 4', 'gvk dct youth'),
  ('IGRV', 'SID', 'GRINDAVIK 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IMLR (Mellor) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'BEANS 3', 'mlr dct beans'),
  ('IMLR', 'SID', 'BEANS 3 VIA DOCKR', 'dockr dct exmor dct beans'),
  ('IMLR', 'SID', 'BEANS 3 VIA DLREY', 'dlrey dct daale dct beans'),
  ('IMLR', 'SID', 'BEANS 3.RENDR', 'mlr dct beans dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'BEANS 3.DINER', 'mlr dct beans dct index dct diner'),
  ('IMLR', 'SID', 'BEANS 3.RENDR VIA DOCKR', 'dockr dct exmor dct beans dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'BEANS 3.RENDR VIA DLREY', 'dlrey dct daale dct beans dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'BEANS 3.DINER VIA DOCKR', 'dockr dct exmor dct beans dct index dct diner'),
  ('IMLR', 'SID', 'BEANS 3.DINER VIA DLREY', 'dlrey dct daale dct beans dct index dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'HAWFA 1', 'mlr dct hawfa'),
  ('IMLR', 'SID', 'HAWFA 1 VIA DOCKR', 'dockr dct exmor dct hawfa'),
  ('IMLR', 'SID', 'HAWFA 1 VIA DLREY', 'dlrey dct daale dct hawfa'),
  ('IMLR', 'SID', 'HAWFA 1.RENDR', 'mlr dct hawfa dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'HAWFA 1.DINER', 'mlr dct hawfa dct index dct diner'),
  ('IMLR', 'SID', 'HAWFA 1.RENDR VIA DOCKR', 'dockr dct exmor dct hawfa dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'HAWFA 1.RENDR VIA DLREY', 'dlrey dct daale dct hawfa dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'HAWFA 1.DINER VIA DOCKR', 'dockr dct exmor dct hawfa dct index dct diner'),
  ('IMLR', 'SID', 'HAWFA 1.DINER VIA DLREY', 'dlrey dct daale dct hawfa dct index dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'KENED 2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IMLR', 'SID', 'KENED 2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IMLR', 'SID', 'KENED 2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'MELLOR 1', 'mlr'),
  ('IMLR', 'SID', 'MELLOR 1 VIA DOCKR', 'dockr dct exmor dct mlr'),
  ('IMLR', 'SID', 'MELLOR 1 VIA DLREY', 'dlrey dct daale dct mlr'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR', 'mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.DINER', 'mlr dct index dct diner'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR VIA DOCKR', 'dockr dct exmor dct mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR VIA DLREY', 'dlrey dct daale dct mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.DINER VIA DOCKR', 'dockr dct exmor dct mlr dct index dct diner'),
  ('IMLR', 'SID', 'MELLOR 1.DINER VIA DLREY', 'dlrey dct daale dct mlr dct index dct diner'),
  ('IMLR', 'SID', 'MELLOR 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'SAWPE 1', 'mlr dct sawpe'),
  ('IMLR', 'SID', 'SAWPE 1 VIA DOCKR', 'dockr dct exmor dct sawpe'),
  ('IMLR', 'SID', 'SAWPE 1 VIA DLREY', 'dlrey dct daale dct sawpe'),
  ('IMLR', 'SID', 'SAWPE 1.RENDR', 'mlr dct sawpe dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'SAWPE 1.DINER', 'mlr dct sawpe dct index dct diner'),
  ('IMLR', 'SID', 'SAWPE 1.RENDR VIA DOCKR', 'dockr dct exmor dct sawpe dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'SAWPE 1.RENDR VIA DLREY', 'dlrey dct daale dct sawpe dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'SAWPE 1.DINER VIA DOCKR', 'dockr dct exmor dct sawpe dct index dct diner'),
  ('IMLR', 'SID', 'SAWPE 1.DINER VIA DLREY', 'dlrey dct daale dct sawpe dct index dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPAP (Paphos) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'SID', 'KINDLE 1', 'pfo dct kindle'),
  ('IPAP', 'SID', 'KINDLE 1 VIA STRAX', 'strax dct kindle'),
  ('IPAP', 'SID', 'KINDLE 1 VIA TINDR', 'tindr dct strax dct kindle')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'SID', 'PAPHOS 1', 'pfo'),
  ('IPAP', 'SID', 'PAPHOS 1 VIA STRAX', 'strax dct pfo'),
  ('IPAP', 'SID', 'PAPHOS 1 VIA TINDR', 'tindr dct strax dct pfo'),
  ('IPAP', 'SID', 'PAPHOS 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ISAU (Sauthamptona) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'BORDER 1', 'sau dct border'),
  ('ISAU', 'SID', 'ECHHO 1', 'sau dct echho'),
  ('ISAU', 'SID', 'SAUTHEMPTONA 1', 'sau'),
  ('ISAU', 'SID', 'SAYOW 1', 'sau dct sayow'),
  ('ISAU', 'SID', 'ZZOOO 1', 'sau dct zzooo'),
  ('ISAU', 'SID', 'SAUTHEMPTONA 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- =============================================================================
-- 4. STAR (tous les aéroports)
-- Routes terminant par le code OACI (ex: ... dct IRFD)
-- Si >>>>>> sur la carte = RADAR VECTORS DCT
-- =============================================================================

-- IRFD
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'STAR', 'BEANS 1', 'beans dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'GORDO 1', 'gordo dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'JAMSI 1', 'jamsi dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2', 'kunav dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'MATRX 1', 'matrx dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'MELLOR 1', 'mellor dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'POPPY 3', 'poppy dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'SUNST 3', 'sunst dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'WILEK 1', 'wilek dct rfd dct IRFD')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ITKO
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'STAR', 'GULEG 1', 'guleg dct hme dct ITKO'),
  ('ITKO', 'STAR', 'ISLAND 2', 'island dct hme dct ITKO'),
  ('ITKO', 'STAR', 'KNIFE 2', 'knife dct hme dct ITKO'),
  ('ITKO', 'STAR', 'PIPER 2', 'piper dct hme dct ITKO')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IBTH
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'STAR', 'DINER 1', 'diner dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1', 'gavin dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1', 'romens dct IBTH'),
  ('IBTH', 'STAR', 'SILVA 1', 'silva dct IBTH'),
  ('IBTH', 'STAR', 'WELSH 1', 'welsh dct IBTH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IPPH
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'STAR', 'HONDA 2', 'honda dct per dct IPPH'),
  ('IPPH', 'STAR', 'SISTA 2', 'sista dct per dct IPPH'),
  ('IPPH', 'STAR', 'TALIS 2', 'talis dct per dct IPPH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ILAR
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'STAR', 'LUBAN 1', 'luban dct lck dct ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1', 'southern dct lck dct ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1', 'western dct lck dct ILAR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IGRV
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'STAR', 'GOLDN 1', 'goldn dct gvk dct IGRV'),
  ('IGRV', 'STAR', 'SPACE 1', 'space dct gvk dct IGRV')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IMLR
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'STAR', 'BIGDY 1', 'bigdy dct mlr dct IMLR'),
  ('IMLR', 'STAR', 'BUCFA 1', 'bufca dct mlr dct IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1', 'northern dct mlr dct IMLR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IPAP
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'STAR', 'JAMSI 1', 'jamsi dct pfo dct IPAP'),
  ('IPAP', 'STAR', 'JUSTY 1', 'justy dct pfo dct IPAP')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ISAU
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'STAR', 'ALDER 1', 'alder dct sau dct ISAU'),
  ('ISAU', 'STAR', 'GEORG 1', 'georg dct sau dct ISAU'),
  ('ISAU', 'STAR', 'VYDDA 1', 'vydda dct sau dct ISAU')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IIAB
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'STAR', 'LARNACA 1', 'lck dct IIAB')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
