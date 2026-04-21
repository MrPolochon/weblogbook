-- ============================================================
-- MIGRATION : Déplacer 5 avions compagnie vers la flotte SIAVI
-- Avions concernés (par immatriculation) :
--   F-HPTZ  Coptère 1    Airbus H135        98%  IRFD
--   F-PHAA  Airborne 1   Bombardier Q400    92%  IRFD
--   F-PHAB  Airborne 2   Bombardier Q400   100%  IRFD
--   F-PHAC  Airborne 3   Bombardier Q400   100%  IRFD
--   F-SQAA  MEDEVAC      King Air 260       88%  IRFD
-- ============================================================

-- 1) Copier les avions vers siavi_avions
INSERT INTO public.siavi_avions (
  type_avion_id, immatriculation, nom_personnalise,
  aeroport_actuel, statut, usure_percent, prix_achat,
  maintenance_fin_at, created_at
)
SELECT
  ca.type_avion_id,
  ca.immatriculation,
  ca.nom_bapteme,
  ca.aeroport_actuel,
  ca.statut,
  ca.usure_percent,
  COALESCE(ca.prix_achat, 0),
  ca.maintenance_fin_at,
  ca.created_at
FROM public.compagnie_avions ca
WHERE ca.immatriculation IN ('F-HPTZ', 'F-PHAA', 'F-PHAB', 'F-PHAC', 'F-SQAA')
ON CONFLICT (immatriculation) DO NOTHING;

-- 2) Nettoyer les références dans plans_vol (compagnie_avion_id) pour ces avions
--    uniquement sur les plans déjà clôturés/annulés (on ne touche pas les plans actifs)
UPDATE public.plans_vol
SET compagnie_avion_id = NULL
WHERE compagnie_avion_id IN (
  SELECT id FROM public.compagnie_avions
  WHERE immatriculation IN ('F-HPTZ', 'F-PHAA', 'F-PHAB', 'F-PHAC', 'F-SQAA')
)
AND statut IN ('cloture', 'annule');

-- 3) Supprimer les avions de compagnie_avions
--    (uniquement ceux qui n'ont AUCUN plan de vol actif en cours)
DELETE FROM public.compagnie_avions
WHERE immatriculation IN ('F-HPTZ', 'F-PHAA', 'F-PHAB', 'F-PHAC', 'F-SQAA')
AND id NOT IN (
  SELECT compagnie_avion_id FROM public.plans_vol
  WHERE compagnie_avion_id IS NOT NULL
    AND statut NOT IN ('cloture', 'annule')
);

-- 4) Créer le hub IRFD comme hub principal SIAVI (puisque tous les avions y sont)
INSERT INTO public.siavi_hubs (aeroport_oaci, is_principal)
VALUES ('IRFD', TRUE)
ON CONFLICT (aeroport_oaci) DO NOTHING;

DO $$ BEGIN RAISE NOTICE 'Migration des 5 avions vers la flotte SIAVI terminée'; END $$;
