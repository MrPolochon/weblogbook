-- Nettoyage idempotent : demandes d'examens instruction > 2 mois
-- Exécuter manuellement dans Supabase SQL Editor si besoin.
-- Les refus (instruction_exam_request_refusals) sont supprimés en CASCADE.

DO $$
DECLARE
  v_aircraft_deleted integer;
  v_requests_deleted integer;
BEGIN
  -- Avions fictifs liés aux sessions d'examen obsolètes
  WITH old_requests AS (
    SELECT id
    FROM public.instruction_exam_requests
    WHERE created_at < now() - interval '2 months'
  )
  DELETE FROM public.inventaire_avions ia
  WHERE ia.instruction_actif = true
    AND ia.instruction_session_kind = 'exam'
    AND ia.instruction_session_id IN (SELECT id FROM old_requests)
    AND ia.instruction_lifecycle IN ('brouillon', 'actif', 'supprime');

  GET DIAGNOSTICS v_aircraft_deleted = ROW_COUNT;

  DELETE FROM public.instruction_exam_requests
  WHERE created_at < now() - interval '2 months';

  GET DIAGNOSTICS v_requests_deleted = ROW_COUNT;

  RAISE NOTICE 'Avions fictifs supprimés : %, demandes supprimées : %',
    v_aircraft_deleted, v_requests_deleted;
END $$;

-- Vérification post-nettoyage
SELECT statut, COUNT(*) AS cnt
FROM public.instruction_exam_requests
GROUP BY statut
ORDER BY cnt DESC;
