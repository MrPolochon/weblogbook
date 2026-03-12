-- SID WNNDY 3 et toutes les variantes pour IRFD (Rockford)
-- MJSTY → WNNDY, puis transitions
-- À exécuter après ../../add_sid_star.sql

INSERT INTO public.sid_star (aeroport, type_procedure, nom, route) VALUES
  -- Base (termine à WNNDY)
  ('IRFD', 'SID', 'WNNDY 3', 'wnndy'),
  
  -- VIA (entrée unique : MJSTY)
  ('IRFD', 'SID', 'WNNDY 3 VIA MJSTY', 'mjsty dct wnndy'),
  
  -- Transitions (sortie depuis WNNDY)
  ('IRFD', 'SID', 'WNNDY 3.SILVA', 'wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX', 'wnndy dct greek dct narxx'),
  
  -- VIA + Transition (combinaisons)
  ('IRFD', 'SID', 'WNNDY 3.SILVA VIA MJSTY', 'mjsty dct wnndy dct oceen dct silva'),
  ('IRFD', 'SID', 'WNNDY 3.NARXX VIA MJSTY', 'mjsty dct wnndy dct greek dct narxx')
ON CONFLICT (aeroport, type_procedure, nom) DO UPDATE SET route = EXCLUDED.route;
