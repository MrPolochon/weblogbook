-- SID TRAINING 1 et toutes les variantes pour IRFD (Rockford)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à TRN VOR)
  ('IRFD', 'SID', 'TRAINING 1', 'trn'),
  
  -- VIA (entrée) — Rwy 25L: DOCKR, Rwy 25C/R: DLREY
  ('IRFD', 'SID', 'TRAINING 1 VIA DOCKR', 'dockr dct weilr dct trn'),
  ('IRFD', 'SID', 'TRAINING 1 VIA DLREY', 'dlrey dct pepul dct haynk dct trn'),
  
  -- Transitions (sortie depuis TRN)
  ('IRFD', 'SID', 'TRAINING 1.MDWST', 'trn dct mdwst'),
  ('IRFD', 'SID', 'TRAINING 1.GODLU', 'trn dct godlu'),
  ('IRFD', 'SID', 'TRAINING 1.GRASS', 'trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRAINING 1.SILVA', 'trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRAINING 1.CYRIL', 'trn dct atpev dct oceen dct silva dct cyril'),
  
  -- VIA + Transition (combinaisons)
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
