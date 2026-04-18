-- =============================================================================
-- SID/STAR COMPLET — Tout en un seul fichier
-- Exécuter ce fichier dans Supabase SQL Editor pour créer/mettre à jour toutes
-- les procédures SID et STAR (IRFD, ITKO, IBTH, IPPH, ILAR, IIAB, IKFL, IMLR, IPAP, ISAU)
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
-- 3. SID RESTANTS (IIAB, IKFL, IMLR, IPAP, ISAU)
-- =============================================================================

-- ========== IIAB (McConnell AFB) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'SID', 'MCCONNELL 1', 'mcconnell'),
  ('IIAB', 'SID', 'MCCONNELL 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IKFL (Keflavik) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IKFL', 'SID', 'CELAR 4', 'gvk dct celar'),
  ('IKFL', 'SID', 'KEFLAVIK 1', 'gvk dct keflavik'),
  ('IKFL', 'SID', 'HAWKN 1', 'gvk dct hawkin'),
  ('IKFL', 'SID', 'THENR 3', 'gvk dct thenr'),
  ('IKFL', 'SID', 'YOUTH 4', 'gvk dct youth'),
  ('IKFL', 'SID', 'KEFLAVIK 2', 'RADAR VECTORS DCT')
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
-- 4. STAR (tous les aéroports) — avec variantes .ENTRY et .ENTRY VIA TRANSITION
-- Format : STAR.ENTRY (point d'entrée) ou STAR.ENTRY VIA TRANSITION (transition piste)
-- Ex: NORTHERN 1.RENDR VIA BUCFA, NORTHERN 1.DINER VIA KUNAV
-- =============================================================================

-- IRFD
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IRFD', 'STAR', 'BEANS 1', 'beans dct logan dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'BEANS 1.SPACE', 'space dct beans dct logan dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'BEANS 1.SEEKS', 'seeks dct beans dct logan dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'GORDO 1', 'gordo dct godlu dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'JAMSI 1', 'jamsi dct godlu dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'JAMSI 1.GRASS', 'grass dct jamsi dct godlu dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'JAMSI 1.ANYMS', 'anyms dct jamsi dct godlu dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2', 'kunav dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2.RENDR VIA BRDGE', 'rendr dct welsh dct index dct kened dct kunav dct brdge dct aliso dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2.RENDR VIA HAWFA', 'rendr dct welsh dct index dct kened dct kunav dct hawfa dct sweet dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2.DINER VIA BRDGE', 'diner dct surge dct index dct kened dct kunav dct brdge dct aliso dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'KUNAV 2.DINER VIA HAWFA', 'diner dct surge dct index dct kened dct kunav dct hawfa dct sweet dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'MATRX 1', 'matrx dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'MELLOR 1', 'mlr dct logan dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'POPPY 3', 'sethr dct poppy dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'POPPY 3.NARXX', 'narxx dct gavin dct sethr dct poppy dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'POPPY 3.CYRIL', 'cyril dct silva dct oceen dct sethr dct poppy dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'POPPY 3.CAWZE', 'cawze dct oceen dct sethr dct poppy dct RADAR VECTORS DCT IRFD'),
  ('IRFD', 'STAR', 'SUNST 3', 'sunst dct laamp dct logan dct rfd dct IRFD'),
  ('IRFD', 'STAR', 'WILEK 1', 'wilek dct RADAR VECTORS DCT IRFD')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ITKO
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'STAR', 'GULEG 1', 'guleg dct piper dct onder dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'ISLAND 2', 'knife dct onder dct piper dct astro dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'KNIFE 2', 'onder dct knife dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'KNIFE 2.PROBE', 'probe dct onder dct knife dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'KNIFE 2.DINER', 'diner dct onder dct knife dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'PIPER 2', 'piper dct astro dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'PIPER 2.RENDR', 'rendr dct piper dct astro dct RADAR VECTORS DCT ITKO'),
  ('ITKO', 'STAR', 'PIPER 2.DINER', 'diner dct onder dct piper dct astro dct RADAR VECTORS DCT ITKO')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IBTH
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'STAR', 'DINER 1', 'diner dct probe dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'DINER 1.KNIFE', 'knife dct diner dct probe dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'DINER 1.TINDR', 'tindr dct diner dct probe dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'DINER 1.STRAX', 'strax dct diner dct probe dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'DINER 1.ROMENS', 'romens dct diner dct probe dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1', 'gavin dct ender dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1.SILVA', 'silva dct gavin dct ender dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1.OCEEN', 'oceen dct gavin dct ender dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1.SETHR', 'sethr dct gavin dct ender dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1', 'rom dct talis dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1.KNIFE', 'knife dct rom dct talis dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1.TINDR', 'tindr dct rom dct talis dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1.STRAX', 'strax dct rom dct talis dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1.DINER', 'diner dct rom dct talis dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'SILVA 1', 'silva dct cyril dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'SILVA 1.GAVIN', 'gavin dct silva dct cyril dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'SILVA 1.OCEEN', 'oceen dct silva dct cyril dct camel dct vox dct IBTH'),
  ('IBTH', 'STAR', 'WELSH 1', 'welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'WELSH 1.RENDR', 'rendr dct welsh dct res dct IBTH'),
  ('IBTH', 'STAR', 'WELSH 1.KEN', 'ken dct welsh dct res dct IBTH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IPPH
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'STAR', 'HONDA 2', 'honda dct haigh dct strax dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'SISTA 2', 'talis dct sista dct noonu dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'SISTA 2.DINER', 'diner dct romns dct antny dct talis dct sista dct noonu dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'SISTA 2.ROMNS', 'romns dct antny dct talis dct sista dct noonu dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'SISTA 2.SILVA', 'silva dct camel dct talis dct sista dct noonu dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'SISTA 2.CAMEL', 'camel dct talis dct sista dct noonu dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'TALIS 2', 'talis dct org dct strax dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'TALIS 2.SILVA', 'silva dct camel dct talis dct org dct strax dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'TALIS 2.CYRIL', 'cyril dct talis dct org dct strax dct RADAR VECTORS DCT IPPH'),
  ('IPPH', 'STAR', 'TALIS 2.DUNKS', 'dunks dct talis dct org dct strax dct RADAR VECTORS DCT IPPH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ILAR
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'STAR', 'LUBAN 1', 'luban dct grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1', 'rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1.CAWZE', 'cawze dct rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1.JUSTY', 'justy dct rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1', 'grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1.JAMSI', 'jamsi dct grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1.ANYMS', 'anyms dct grass dct rents dct RADAR VECTORS DCT ILAR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IKFL
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IKFL', 'STAR', 'GOLDN 1', 'blank dct thenr dct goldn dct RADAR VECTORS DCT IKFL'),
  ('IKFL', 'STAR', 'SPACE 1', 'space dct celar dct RADAR VECTORS DCT IKFL')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IMLR
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'STAR', 'BIGDY 1', 'hawfa dct bigdy dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BIGDY 1.SETHR', 'sethr dct hawfa dct bigdy dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BIGDY 1.ATPEV', 'aptev dct hawfa dct bigdy dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BIGDY 1.KUNAV', 'kunav dct bigdy dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BUCFA 1', 'sawpe dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BUCFA 1.SPACE', 'space dct sawpe dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'BUCFA 1.BEANS', 'beans dct sawpe dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1', 'kened dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1.RENDR VIA BUCFA', 'rendr dct welsh dct index dct kened dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1.RENDR VIA KUNAV', 'rendr dct welsh dct index dct kened dct kunav dct bigdy dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1.DINER VIA BUCFA', 'diner dct nkita dct index dct kened dct bufca dct RADAR VECTORS DCT IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1.DINER VIA KUNAV', 'diner dct nkita dct index dct kened dct kunav dct bigdy dct RADAR VECTORS DCT IMLR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IPAP
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'STAR', 'JAMSI 1', 'jamsi dct grass dct kin dct IPAP'),
  ('IPAP', 'STAR', 'JAMSI 1.VIA LAZER', 'jamsi dct lazer dct aqwrt dct hut dct IPAP'),
  ('IPAP', 'STAR', 'JUSTY 1', 'justy dct kin dct IPAP')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ISAU
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'STAR', 'ALDER 1', 'alder dct sau dct ISAU'),
  ('ISAU', 'STAR', 'GEORG 1', 'georg dct sau dct ISAU'),
  ('ISAU', 'STAR', 'VYDDA 1', 'vydda dct sau dct ISAU')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- IIAB
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'STAR', 'LARNACA 1', 'lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.GRASS', 'grass dct lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.RENTS', 'rents dct lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.MCL', 'mcl dct lck dct aqwrt dct RADAR VECTORS DCT IIAB')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
