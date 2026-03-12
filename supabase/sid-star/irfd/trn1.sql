-- SID TRAINING 1 et toutes les variantes pour IRFD (Rockford)
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à TRN VOR)
  ('IRFD', 'SID', 'TRN1', 'trn'),
  
  -- VIA (entrée) — Rwy 25L: DOCKR, Rwy 25C/R: DLREY
  ('IRFD', 'SID', 'TRN1 VIA DOCKR', 'dockr dct weilr dct trn'),
  ('IRFD', 'SID', 'TRN1 VIA DLREY', 'dlrey dct pepul dct haynk dct trn'),
  
  -- Transitions (sortie depuis TRN)
  ('IRFD', 'SID', 'TRN1.MDWST', 'trn dct mdwst'),
  ('IRFD', 'SID', 'TRN1.GODLU', 'trn dct godlu'),
  ('IRFD', 'SID', 'TRN1.GRASS', 'trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRN1.SILVA', 'trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRN1.CYRIL', 'trn dct atpev dct oceen dct silva dct cyril'),
  
  -- VIA + Transition (combinaisons)
  ('IRFD', 'SID', 'TRN1.MDWST VIA DOCKR', 'dockr dct weilr dct trn dct mdwst'),
  ('IRFD', 'SID', 'TRN1.MDWST VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct mdwst'),
  ('IRFD', 'SID', 'TRN1.GODLU VIA DOCKR', 'dockr dct weilr dct trn dct godlu'),
  ('IRFD', 'SID', 'TRN1.GODLU VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct godlu'),
  ('IRFD', 'SID', 'TRN1.GRASS VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRN1.GRASS VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct jamsi dct grass'),
  ('IRFD', 'SID', 'TRN1.SILVA VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRN1.SILVA VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct oceen dct silva'),
  ('IRFD', 'SID', 'TRN1.CYRIL VIA DOCKR', 'dockr dct weilr dct trn dct atpev dct oceen dct silva dct cyril'),
  ('IRFD', 'SID', 'TRN1.CYRIL VIA DLREY', 'dlrey dct pepul dct haynk dct trn dct atpev dct oceen dct silva dct cyril')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
