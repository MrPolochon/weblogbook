-- ============================================================
-- PURGE HISTORIQUE > 1 MOIS (plans + incidents)
-- ============================================================
-- 1) Supprime les plans clotures/annules plus vieux qu'un mois.
-- 2) Supprime aussi les incidents de vol "clos" plus vieux qu'un mois
--    (crash / atterrissage urgence).
-- 3) Supprime les signalements IFSA de type incident classes/rejetes
--    plus vieux qu'un mois.
--
-- Securite:
-- - N'affecte pas les plans ouverts.
-- - atc_plans_controles suit via ON DELETE CASCADE sur plans_vol.
-- - incidents_vol en statut non clos restent conserves.
-- ============================================================

BEGIN;

-- Prévisualisation (optionnel): volumes qui vont être supprimés
-- SELECT statut, COUNT(*) AS nb
-- FROM public.plans_vol
-- WHERE statut IN ('cloture', 'annule')
--   AND COALESCE(cloture_at, created_at) < now() - interval '1 month'
-- GROUP BY statut;
--
-- SELECT statut, COUNT(*) AS nb
-- FROM public.incidents_vol
-- WHERE statut = 'clos'
--   AND created_at < now() - interval '1 month'
-- GROUP BY statut;
--
-- SELECT statut, COUNT(*) AS nb
-- FROM public.ifsa_signalements
-- WHERE type_signalement = 'incident'
--   AND statut IN ('classe', 'rejete')
--   AND created_at < now() - interval '1 month'
-- GROUP BY statut;

DELETE FROM public.plans_vol
WHERE statut IN ('cloture', 'annule')
  AND COALESCE(cloture_at, created_at) < now() - interval '1 month';

DELETE FROM public.incidents_vol
WHERE statut = 'clos'
  AND created_at < now() - interval '1 month';

DELETE FROM public.ifsa_signalements
WHERE type_signalement = 'incident'
  AND statut IN ('classe', 'rejete')
  AND created_at < now() - interval '1 month';

COMMIT;

-- Vérification (optionnel)
-- SELECT statut, COUNT(*) AS nb_restants
-- FROM public.plans_vol
-- WHERE statut IN ('cloture', 'annule')
-- GROUP BY statut;
--
-- SELECT statut, COUNT(*) AS nb_restants
-- FROM public.incidents_vol
-- GROUP BY statut;

