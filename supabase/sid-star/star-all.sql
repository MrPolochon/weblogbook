-- STAR pour tous les aéroports
-- Source : c:\Users\bonno\Downloads\PTFS STAR
-- Routes terminant par le code OACI de l'aéroport (ex: ... dct IRFD)
-- Si >>>>>> sur la carte = RADAR VECTORS DCT
-- À exécuter après add_sid_star.sql (ou seed-all-complet.sql)

-- ========== IRFD (Greater Rockford) ==========
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

-- ========== ITKO (Tokyo) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ITKO', 'STAR', 'GULEG 1', 'guleg dct hme dct ITKO'),
  ('ITKO', 'STAR', 'ISLAND 2', 'island dct hme dct ITKO'),
  ('ITKO', 'STAR', 'KNIFE 2', 'knife dct hme dct ITKO'),
  ('ITKO', 'STAR', 'PIPER 2', 'piper dct hme dct ITKO')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IBTH (Saint Barthelemy) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IBTH', 'STAR', 'DINER 1', 'diner dct IBTH'),
  ('IBTH', 'STAR', 'GAVIN 1', 'gavin dct IBTH'),
  ('IBTH', 'STAR', 'ROMENS 1', 'romens dct IBTH'),
  ('IBTH', 'STAR', 'SILVA 1', 'silva dct IBTH'),
  ('IBTH', 'STAR', 'WELSH 1', 'welsh dct IBTH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPPH (Perth) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPPH', 'STAR', 'HONDA 2', 'honda dct per dct IPPH'),
  ('IPPH', 'STAR', 'SISTA 2', 'sista dct per dct IPPH'),
  ('IPPH', 'STAR', 'TALIS 2', 'talis dct per dct IPPH')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ILAR (Larnaca) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ILAR', 'STAR', 'LUBAN 1', 'luban dct lck dct ILAR'),
  ('ILAR', 'STAR', 'SOUTHERN 1', 'southern dct lck dct ILAR'),
  ('ILAR', 'STAR', 'WESTERN 1', 'western dct lck dct ILAR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IGRV (Grindavik) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'STAR', 'GOLDN 1', 'goldn dct gvk dct IGRV'),
  ('IGRV', 'STAR', 'SPACE 1', 'space dct gvk dct IGRV')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IMLR (Mellor) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'STAR', 'BIGDY 1', 'bigdy dct mlr dct IMLR'),
  ('IMLR', 'STAR', 'BUCFA 1', 'bufca dct mlr dct IMLR'),
  ('IMLR', 'STAR', 'NORTHERN 1', 'northern dct mlr dct IMLR')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPAP (Paphos) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'STAR', 'JAMSI 1', 'jamsi dct pfo dct IPAP'),
  ('IPAP', 'STAR', 'JUSTY 1', 'justy dct pfo dct IPAP')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ISAU (Sauthamptona) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'STAR', 'ALDER 1', 'alder dct sau dct ISAU'),
  ('ISAU', 'STAR', 'GEORG 1', 'georg dct sau dct ISAU'),
  ('ISAU', 'STAR', 'VYDDA 1', 'vydda dct sau dct ISAU')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IIAB (McConnell AFB, ex-IAAB) ==========
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'STAR', 'LARNACA 1', 'lck dct IIAB')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- Si une carte indique >>>>>> (vecteurs radar), remplacer la route par 'RADAR VECTORS DCT'
