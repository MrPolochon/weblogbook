-- SID OSHNN 1 et toutes les variantes pour IRFD (Rockford)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à OSHNN)
  ('IRFD', 'SID', 'OSHNN1', 'oshnn'),
  
  -- VIA (entrée) — Rwy 25L: HIIPR, Rwy 25C/R: FABRA
  ('IRFD', 'SID', 'OSHNN1 VIA HIIPR', 'hiipr dct shaef dct pevee dct holtz dct oshnn'),
  ('IRFD', 'SID', 'OSHNN1 VIA FABRA', 'fabra dct shaef dct pevee dct holtz dct oshnn'),
  
  -- Transitions (sortie depuis OSHNN)
  ('IRFD', 'SID', 'OSHNN1.SILVA', 'oshnn dct oceen dct silva'),
  ('IRFD', 'SID', 'OSHNN1.CYRIL', 'oshnn dct goose dct cyril'),
  ('IRFD', 'SID', 'OSHNN1.GRASS', 'oshnn dct pmpkn dct grass'),
  ('IRFD', 'SID', 'OSHNN1.ARCUS', 'oshnn dct zoomm dct sebby dct atpev dct arcus'),
  ('IRFD', 'SID', 'OSHNN1.JAMSI', 'oshnn dct jamsi'),
  
  -- VIA + Transition (combinaisons)
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
