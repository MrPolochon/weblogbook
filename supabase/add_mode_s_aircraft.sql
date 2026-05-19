-- ============================================================
-- Mode S transponder capability per aircraft type
-- Avions avec transpondeur Mode S (TCAS II / ADS-B out inclus)
-- Basé sur les certifications réelles et l'ère de conception.
-- Avions sans Mode S : n'auront accès qu'au Mode C (et A).
-- ============================================================

ALTER TABLE public.types_avion
  ADD COLUMN IF NOT EXISTS has_mode_s BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.types_avion.has_mode_s IS
  'true = l''avion dispose d''un transpondeur Mode S (ADS-B / TCAS). '
  'false = transpondeur Mode C uniquement (anciens appareils ou avions légers simples).';

-- ============================================================
-- AVIONS AVEC MODE S
-- ============================================================

-- Commerciaux modernes (années 90+, équipés Mode S ELS/EHS obligatoire)
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'AT72',  -- ATR-72
  'B738',  -- Boeing 737 (NG / -800)
  'B744',  -- Boeing 747-400
  'B752',  -- Boeing 757
  'B763',  -- Boeing 767
  'B77W',  -- Boeing 777
  'B788',  -- Boeing 787
  'BCS3',  -- Airbus A220
  'A320',  -- Airbus A320
  'A333',  -- Airbus A330
  'A346',  -- Airbus A340
  'A359',  -- Airbus A350
  'A388',  -- Airbus A380
  'CRJ7',  -- Bombardier CRJ700
  'DH8D',  -- Bombardier Q400
  'MD11',  -- McDonnell Douglas MD-11
  'MD90',  -- McDonnell Douglas MD-90
  'E190'   -- Embraer E190
);

-- Cargo modernes (dérivés d'appareils Mode S)
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'BLXL',  -- Airbus BelugaXL
  'BLCF',  -- Boeing DreamLifter
  'B74F',  -- Boeing 747 Cargo
  'B75F',  -- Boeing 757 Cargo
  'B76F',  -- Boeing 767 Cargo
  'B77F',  -- Boeing 777 Cargo
  'MD1F',  -- MD-11 Cargo
  'A225',  -- AN-225 (avionique modernisée)
  'AT7F',  -- ATR 72F Cargo
  'A33F',  -- Airbus A330 Cargo
  'B73F'   -- Boeing 737 Cargo
);

-- Légers modernes (cockpit numérique / certifiés espace contrôlé)
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'LJ45',  -- Bombardier Learjet 45
  'SF50',  -- Cirrus Vision SF50
  'DA50',  -- Diamond DA50
  'BE20'   -- King Air 260
);

-- Militaires modernes avec avionique OTAN Mode S / TCAS
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'F15',   -- F-15E Strike Eagle
  'F16',   -- F-16 Fighting Falcon
  'F18S',  -- F/A-18 Super Hornet
  'F22',   -- F-22 Raptor
  'F35',   -- F-35B
  'B2',    -- B-2 Spirit
  'EUFI',  -- Eurofighter Typhoon
  'P8',    -- Boeing P-8 Poseidon
  'C17',   -- Boeing C-17 Globemaster III
  'EC18',  -- EC-18B
  'E3CF',  -- E-3 Sentry
  'B1',    -- B-1 Lancer
  'JAS'    -- JAS 39 Gripen
);

-- Hélicoptères civils IFR
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'B412',  -- Bell 412
  'EC35',  -- Airbus H135
  'S92'    -- Sikorsky S-92
);

-- Ravitailleurs modernes (dérivés d'appareils commerciaux Mode S)
UPDATE public.types_avion SET has_mode_s = true WHERE code_oaci IN (
  'K767',  -- KC-767 (dérivé B767)
  'A3MR'   -- A330 MRTT (dérivé A330)
);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
SELECT
  CASE WHEN has_mode_s THEN 'Mode S' ELSE 'Mode C seulement' END as capacite,
  COUNT(*) as nombre,
  STRING_AGG(code_oaci, ', ' ORDER BY code_oaci) as avions
FROM public.types_avion
GROUP BY has_mode_s
ORDER BY has_mode_s DESC;
