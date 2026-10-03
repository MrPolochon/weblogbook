-- ============================================================================
-- Seed : fermeture IRFD (Greater Rockford) et IPPH (Perth Intl.)
--   degradation des installations — AD ferme, aucun trafic.
--   2 NOTAMs anglais + 2 NOTAMs francais correspondants.
--
-- permanent = true, au_at fixe a 9999-12-31 comme POST /api/notams.
-- Sur chaque NOTAM anglais, reference_fr pointe vers l'identifiant francais.
-- Reutilisable : ON CONFLICT (identifiant) DO NOTHING. Heures en UTC.
-- Effet des 2026-10-03 00:00 UTC, jusqu'a nouvel ordre.
-- ============================================================================

INSERT INTO public.notams
  (identifiant, code_aeroport, du_at, au_at, permanent, champ_a, champ_e, champ_q, priorite, reference_fr, annule)
VALUES

-- ==== VERSIONS ANGLAISES ====================================================

(
  'IRFD-A0200/26', 'IRFD',
  '2026-10-03 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'AD CLSD DUE TO DETERIORATED FACILITIES.\nALL RWY, TWY AND APRONS UNAVBL.\nNO TFC ACCEPTED.\nUNTIL FURTHER NOTICE.',
  'PTFS/QFALC/IV/NBO/A/000/999/IRFD',
  'A',
  'IRFD-F0200/26',
  false
),

(
  'IPPH-A0200/26', 'IPPH',
  '2026-10-03 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IPPH',
  E'AD CLSD DUE TO DETERIORATED FACILITIES.\nALL RWY, TWY AND APRONS UNAVBL.\nNO TFC ACCEPTED.\nUNTIL FURTHER NOTICE.',
  'PTFS/QFALC/IV/NBO/A/000/999/IPPH',
  'A',
  'IPPH-F0200/26',
  false
),

-- ==== VERSIONS FRANCAISES ===================================================

(
  'IRFD-F0200/26', 'IRFD',
  '2026-10-03 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IRFD',
  E'AD FERME EN RAISON DE LA DEGRADATION DES INSTALLATIONS.\nENSEMBLE DES PISTES, VOIES DE CIRCULATION ET AIRES DE TRAFIC INDISPONIBLE.\nAUCUN TRAFIC ACCEPTE.\nJUSQU''A NOUVEL ORDRE.',
  'PTFS/QFALC/IV/NBO/A/000/999/IRFD',
  'A',
  NULL,
  false
),

(
  'IPPH-F0200/26', 'IPPH',
  '2026-10-03 00:00:00+00', '9999-12-31 23:59:59+00', true,
  'IPPH',
  E'AD FERME EN RAISON DE LA DEGRADATION DES INSTALLATIONS.\nENSEMBLE DES PISTES, VOIES DE CIRCULATION ET AIRES DE TRAFIC INDISPONIBLE.\nAUCUN TRAFIC ACCEPTE.\nJUSQU''A NOUVEL ORDRE.',
  'PTFS/QFALC/IV/NBO/A/000/999/IPPH',
  'A',
  NULL,
  false
)

ON CONFLICT (identifiant) DO NOTHING;
