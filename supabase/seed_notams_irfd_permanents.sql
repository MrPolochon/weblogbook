-- ============================================================================
-- Seed : NOTAMs PERMANENTS Greater Rockford (IRFD)
--   - 5 NOTAMs anglais (IRFD-A0090/26 .. IRFD-A0094/26)
--   - 5 NOTAMs francais correspondants (IRFD-F0090/26 .. IRFD-F0094/26)
--
-- permanent = true, donc au_at fixe a 9999-12-31 comme le fait POST /api/notams.
-- Sur chaque NOTAM anglais, reference_fr pointe vers l'identifiant francais.
-- Reutilisable : ON CONFLICT (identifiant) DO NOTHING. Heures en UTC.
--
-- Les designateurs (TWY A/H/K, points d'attente A3S/A3/A4/A5, pistes
-- 07L/07C/07R/25L/25C/25R) correspondent au referentiel
-- src/lib/ptfs-perf/data/airports.ts.
--
-- ASDA 25R : la 25R n'a pas de prolongement d'arret (tora = asda dans le
-- referentiel de cartes), donc ASDA suit le TORA a 720M. Les 45M d'ecart entre
-- TODA et TORA correspondent au prolongement degage.
-- ============================================================================

INSERT INTO public.notams
  (identifiant, code_aeroport, du_at, au_at, permanent, champ_a, champ_e, champ_q, priorite, reference_fr, annule)
VALUES

-- ==== VERSIONS ANGLAISES ====================================================

-- 90 TWY A inutilisable a partir de la jonction K/A ---------------------------
(
  'IRFD-A0090/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'TWY A UNUSABLE FROM TWY K/TWY A JUNCTION DUE TO DETERIORATED PAVEMENT.\nHOLDING POINTS A3S, A3, A4 AND A5 UNUSABLE.\nFOR DEP RWY 25L USE RWY 07C/25C OR REQUEST BACKTRACK RWY 25L.',
  'PTFS/QMXLC/IV/NBO/A/000/999/IRFD',
  'A',
  'IRFD-F0090/26',
  false
),

-- 91 Tours de piste ----------------------------------------------------------
(
  'IRFD-A0091/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'TRAFFIC CIRCUITS PREFERENTIAL ON RWY 07R/25L.\nTRAFFIC CIRCUITS ON RWY 07L/25R AVBL, TOUCH AND GO OR FULL STOP ONLY.\nUNTIL FURTHER NOTICE.',
  'PTFS/QFAXX/IV/NBO/A/000/999/IRFD',
  'B',
  'IRFD-F0091/26',
  false
),

-- 92 TWY H fermee ------------------------------------------------------------
(
  'IRFD-A0092/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'TWY H CLSD DUE TO WORK IN PROGRESS ON RWY 07L/25R.',
  'PTFS/QMXLC/IV/NBO/A/000/999/IRFD',
  'B',
  'IRFD-F0092/26',
  false
),

-- 93 Configurations de piste preferentielles ---------------------------------
(
  'IRFD-A0093/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'DEP RWY 07R TO BE AVOIDED.\nAD IN CONFIG 07: PREFERENTIAL DEP RWY 07L, ARR RWY 07C.\nAD IN CONFIG 25: PREFERENTIAL DEP RWY 25C, ARR RWY 25R OR 25C AS APPLICABLE.',
  'PTFS/QFAXX/IV/NBO/A/000/999/IRFD',
  'B',
  'IRFD-F0093/26',
  false
),

-- 94 Seuil 25R decale --------------------------------------------------------
(
  'IRFD-A0094/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'RWY 25R THR DISPLACED DUE TO WORK IN PROGRESS.\nDECLARED DISTANCES RWY 25R: TORA 720M, TODA 765M, LDA 720M, ASDA 720M.',
  'PTFS/QMDXX/IV/NBO/A/000/999/IRFD',
  'A',
  'IRFD-F0094/26',
  false
),

-- ==== VERSIONS FRANCAISES ===================================================

-- 90 TWY A inutilisable a partir de la jonction K/A ---------------------------
(
  'IRFD-F0090/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'VOIE DE CIRCULATION A INUTILISABLE A PARTIR DE L''INTERSECTION DES TWY K ET A EN RAISON D''UN REVETEMENT DETERIORE.\nPOINTS D''ATTENTE A3S, A3, A4 ET A5 INUTILISABLES.\nPOUR UN DEPART EN 25L, PREVOIR LA PISTE 07C/25C OU DEMANDER UNE REMONTEE DE PISTE EN 25L.',
  'PTFS/QMXLC/IV/NBO/A/000/999/IRFD',
  'A',
  NULL,
  false
),

-- 91 Tours de piste ----------------------------------------------------------
(
  'IRFD-F0091/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'TOURS DE PISTE PREFERENTIELS SUR LA PISTE 07R/25L.\nTOURS DE PISTE POSSIBLES SUR LA PISTE 07L/25R, UNIQUEMENT EN TOUCHERS OU EN COMPLETS.\nJUSQU''A NOUVEL ORDRE.',
  'PTFS/QFAXX/IV/NBO/A/000/999/IRFD',
  'B',
  NULL,
  false
),

-- 92 TWY H fermee ------------------------------------------------------------
(
  'IRFD-F0092/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'VOIE DE CIRCULATION H FERMEE EN RAISON DE TRAVAUX SUR LA PISTE 07L/25R.',
  'PTFS/QMXLC/IV/NBO/A/000/999/IRFD',
  'B',
  NULL,
  false
),

-- 93 Configurations de piste preferentielles ---------------------------------
(
  'IRFD-F0093/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'DEPARTS EN 07R A EVITER.\nAD EN CONFIGURATION 07 : DEPART PREFERENTIEL EN 07L, ARRIVEE EN 07C.\nAD EN CONFIGURATION 25 : DEPART PREFERENTIEL EN 25C, ARRIVEE EN 25R OU 25C SELON LE CAS.',
  'PTFS/QFAXX/IV/NBO/A/000/999/IRFD',
  'B',
  NULL,
  false
),

-- 94 Seuil 25R decale --------------------------------------------------------
(
  'IRFD-F0094/26', 'IRFD',
  '2026-09-01 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'SEUIL DE LA PISTE 25R DECALE POUR TRAVAUX.\nDISTANCES DECLAREES PISTE 25R : TORA 720M, TODA 765M, LDA 720M, ASDA 720M.',
  'PTFS/QMDXX/IV/NBO/A/000/999/IRFD',
  'A',
  NULL,
  false
)

ON CONFLICT (identifiant) DO NOTHING;
