-- STAR pour tous les aéroports — avec variantes VIA (points d'entrée)
-- Source : c:\Users\bonno\Downloads\PTFS STAR
-- Si 2+ points d'entrée sur une carte = variantes (ex: PIPER 2 VIA RENDR, PIPER 2 VIA DINER)
-- Routes terminant par le code OACI (ex: ... dct IRFD)
-- Si >>>>>> sur la carte = RADAR VECTORS DCT avant l'aéroport

-- ========== IRFD (Greater Rockford) ==========
-- Format : STAR.ENTRY ou STAR.ENTRY VIA TRANSITION
-- BEANS 1 : .SPACE, .SEEKS
-- KUNAV 2 : .RENDR, .DINER + VIA BRDGE (RWY 7) ou VIA HAWFA (RWY 25)
-- POPPY 3 : .NARXX, .CYRIL, .CAWZE
-- JAMSI 1 : .GRASS, .ANYMS
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

-- ========== ITKO (Tokyo) ==========
-- KNIFE 2 : .PROBE, .DINER
-- PIPER 2 : .RENDR, .DINER
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

-- ========== IBTH (Saint Barthelemy) ==========
-- Format : STAR.ENTRY
-- DINER 1 : .KNIFE, .TINDR, .STRAX, .ROMENS
-- GAVIN 1 : .SILVA, .OCEEN, .SETHR
-- ROMENS 1 : .KNIFE, .TINDR, .STRAX, .DINER
-- SILVA 1 : .GAVIN, .OCEEN
-- WELSH 1 : .RENDR, .KEN
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

-- ========== IPPH (Perth) ==========
-- SISTA 2 : .DINER, .ROMNS, .SILVA, .CAMEL
-- TALIS 2 : .SILVA, .CYRIL, .DUNKS
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

-- ========== ILAR (Larnaca) ==========
-- SOUTHERN 1 : .CAWZE, .JUSTY
-- WESTERN 1 : .JAMSI, .ANYMS
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'STAR', 'LUBAN 1', 'luban dct grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1', 'rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1.CAWZE', 'cawze dct rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1.JUSTY', 'justy dct rents dct dagat dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1', 'grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1.JAMSI', 'jamsi dct grass dct rents dct RADAR VECTORS DCT ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1.ANYMS', 'anyms dct grass dct rents dct RADAR VECTORS DCT ILAR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IGRV (Keflavik) ==========
-- GOLDN 1 et SPACE 1 : entrée unique
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'STAR', 'GOLDN 1', 'blank dct thenr dct goldn dct RADAR VECTORS DCT IGRV'),
  ('IGRV', 'STAR', 'SPACE 1', 'space dct celar dct RADAR VECTORS DCT IGRV')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IMLR (Mellor) ==========
-- Format : STAR.ENTRY VIA TRANSITION (point d'entrée + transition piste)
-- BIGDY 1 : .SETHR, .ATPEV, .KUNAV (3 entrées, pas de VIA transition)
-- BUCFA 1 : .SPACE, .BEANS (2 entrées, RWY 25 uniquement)
-- NORTHERN 1 : .RENDR/.DINER + VIA BUCFA (RWY 07) ou VIA KUNAV (RWY 25)
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

-- ========== IPAP (Paphos) ==========
-- JAMSI 1 : VIA GRASS (RWY 17), VIA LAZER (RWY 35)
-- JUSTY 1 : entrée unique
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'STAR', 'JAMSI 1', 'jamsi dct grass dct kin dct IPAP'),
  ('IPAP', 'STAR', 'JAMSI 1.VIA LAZER', 'jamsi dct lazer dct aqwrt dct hut dct IPAP'),
  ('IPAP', 'STAR', 'JUSTY 1', 'justy dct kin dct IPAP')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ISAU (Sauthamptona) ==========
-- Pas de cartes STAR avec variantes trouvées
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'STAR', 'ALDER 1', 'alder dct sau dct ISAU'),
  ('ISAU', 'STAR', 'GEORG 1', 'georg dct sau dct ISAU'),
  ('ISAU', 'STAR', 'VYDDA 1', 'vydda dct sau dct ISAU')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IIAB (McConnell AFB, dossier IAAB) ==========
-- LARNACA 1 : .GRASS, .RENTS, .MCL
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'STAR', 'LARNACA 1', 'lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.GRASS', 'grass dct lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.RENTS', 'rents dct lck dct aqwrt dct RADAR VECTORS DCT IIAB'),
  ('IIAB', 'STAR', 'LARNACA 1.MCL', 'mcl dct lck dct aqwrt dct RADAR VECTORS DCT IIAB')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
