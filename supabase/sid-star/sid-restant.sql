-- SID restants (IIAB, IGRV, IMLR, IPAP, ISAU)
-- Source : c:\Users\bonno\Downloads\SID RESTANT
-- À exécuter après supabase/add_sid_star.sql
-- Format identique à seed-all.sql (blocs séparés, variantes VIA et .TRANSITION)
-- Routes à vérifier/adapter depuis les cartes PTFS si besoin

-- ========== IIAB (McConnell AFB) ==========
-- MCCONNELL 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'SID', 'MCCONNELL 1', 'mcconnell')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- MCCONNELL 2 (omnidirectionnel, >>>>>>)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IIAB', 'SID', 'MCCONNELL 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IGRV (Grindavik) ==========
-- CELAR 4
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'CELAR 4', 'gvk dct celar')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- GRINDAVIK 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'GRINDAVIK 1', 'gvk dct grindavik')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- HAWKN 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'HAWKN 1', 'gvk dct hawkin')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- THENR 3
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'THENR 3', 'gvk dct thenr')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- YOUTH 4
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'YOUTH 4', 'gvk dct youth')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- GRINDAVIK 2 (omnidirectionnel, >>>>>>)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IGRV', 'SID', 'GRINDAVIK 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IMLR (Mellor) — Rockford FIR, variantes VIA DOCKR/DLREY et .RENDR/.DINER ==========
-- BEANS 3
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

-- HAWFA 1
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

-- KENED 2
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'KENED 2', 'VECTORS FOR KENED2 KUNAV DCT KENED'),
  ('IMLR', 'SID', 'KENED 2.RENDR', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT WELSH DCT PROBE DCT RENDR'),
  ('IMLR', 'SID', 'KENED 2.DINER', 'VECTORS FOR KENED2 KUNAV DCT KENED DCT INDEX DCT NKITA DCT DINER')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- MELLOR 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'MELLOR 1', 'mlr'),
  ('IMLR', 'SID', 'MELLOR 1 VIA DOCKR', 'dockr dct exmor dct mlr'),
  ('IMLR', 'SID', 'MELLOR 1 VIA DLREY', 'dlrey dct daale dct mlr'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR', 'mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.DINER', 'mlr dct index dct diner'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR VIA DOCKR', 'dockr dct exmor dct mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.RENDR VIA DLREY', 'dlrey dct daale dct mlr dct welsh dct probe dct rendr'),
  ('IMLR', 'SID', 'MELLOR 1.DINER VIA DOCKR', 'dockr dct exmor dct mlr dct index dct diner'),
  ('IMLR', 'SID', 'MELLOR 1.DINER VIA DLREY', 'dlrey dct daale dct mlr dct index dct diner')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- SAWPE 1
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

-- MELLOR 2 (omnidirectionnel, >>>>>>)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IMLR', 'SID', 'MELLOR 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== IPAP (Paphos) — Larnaca FIR, variantes VIA STRAX/TINDR ==========
-- KINDLE 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'SID', 'KINDLE 1', 'pfo dct kindle'),
  ('IPAP', 'SID', 'KINDLE 1 VIA STRAX', 'strax dct kindle'),
  ('IPAP', 'SID', 'KINDLE 1 VIA TINDR', 'tindr dct strax dct kindle')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- PAPHOS 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'SID', 'PAPHOS 1', 'pfo'),
  ('IPAP', 'SID', 'PAPHOS 1 VIA STRAX', 'strax dct pfo'),
  ('IPAP', 'SID', 'PAPHOS 1 VIA TINDR', 'tindr dct strax dct pfo')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- PAPHOS 2 (omnidirectionnel, >>>>>>)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('IPAP', 'SID', 'PAPHOS 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ========== ISAU (Sauthamptona) ==========
-- BORDER 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'BORDER 1', 'sau dct border')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ECHHO 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'ECHHO 1', 'sau dct echho')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- SAUTHEMPTONA 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'SAUTHEMPTONA 1', 'sau')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- SAYOW 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'SAYOW 1', 'sau dct sayow')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- ZZOOO 1
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'ZZOOO 1', 'sau dct zzooo')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;

-- SAUTHEMPTONA 2 (omnidirectionnel, >>>>>>)
INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  ('ISAU', 'SID', 'SAUTHEMPTONA 2', 'RADAR VECTORS DCT')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
