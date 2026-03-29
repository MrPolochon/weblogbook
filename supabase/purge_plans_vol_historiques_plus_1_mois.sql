-- ============================================================
-- PURGE HISTORIQUE PLANS DE VOL > 1 MOIS
-- Supprime les plans clôturés/annulés plus vieux qu'un mois.
-- ============================================================
-- Sécurité:
-- - N'affecte pas les plans ouverts.
-- - Les lignes liées dans atc_plans_controles sont supprimées via ON DELETE CASCADE.
-- ============================================================

BEGIN;

-- Prévisualisation (optionnel): volumes qui vont être supprimés
-- SELECT statut, COUNT(*) AS nb
-- FROM public.plans_vol
-- WHERE statut IN ('cloture', 'annule')
--   AND COALESCE(cloture_at, created_at) < now() - interval '1 month'
-- GROUP BY statut;

DELETE FROM public.plans_vol
WHERE statut IN ('cloture', 'annule')
  AND COALESCE(cloture_at, created_at) < now() - interval '1 month';

COMMIT;

-- Vérification (optionnel)
-- SELECT statut, COUNT(*) AS nb_restants
-- FROM public.plans_vol
-- WHERE statut IN ('cloture', 'annule')
-- GROUP BY statut;

