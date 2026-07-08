-- ===========================================================================
-- Nettoyage des demandes Ground Crew orphelines
-- À exécuter UNE SEULE FOIS dans Supabase SQL Editor pour corriger les
-- demandes existantes liées à des plans de vol déjà clôturés/annulés.
-- ===========================================================================

-- Annuler toutes les demandes GC dont le plan de vol est clôturé, annulé ou refusé.
UPDATE public.ground_service_requests
SET statut = 'rejected'
WHERE statut IN ('pending', 'accepted', 'in_progress')
  AND plan_vol_id IN (
    SELECT id FROM public.plans_vol
    WHERE statut IN ('cloture', 'annule', 'refuse', 'en_pause')
  );

-- Vérification : afficher le nombre de demandes nettoyées par statut de plan.
SELECT
  pv.statut AS statut_plan,
  COUNT(gsr.id) AS nb_demandes_restantes
FROM public.ground_service_requests gsr
JOIN public.plans_vol pv ON pv.id = gsr.plan_vol_id
WHERE gsr.statut IN ('pending', 'accepted', 'in_progress')
GROUP BY pv.statut
ORDER BY pv.statut;
