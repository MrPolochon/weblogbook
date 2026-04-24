-- =============================================================================
-- Réattribution des demandes d’examens (instruction_exam_requests)
-- Objectif : recaler instructeur_id sur le « nouveau » référentiel d’examinateurs
-- (aligné sur getExaminerPoolUserIds : titulaires **FE** pour le vol ; titulaires **ATC FE**
-- pour les codes examen ATC / AFIS — plus d’inclusion automatique des admins).
--
-- Portée : uniquement les statuts EN COURS (assigne, accepte, en_cours).
--          Les demandes « termine » / « refuse » ne sont pas modifiées (historique).
--
-- ⚠️ NE PAS s’appuyer sur le SQL ci-dessous pour une répartition « équitable » : un fallback
--    du type `ORDER BY id LIMIT 1` concentre tout sur le même examinateur (souvent le
--    min UUID). Même le référent seul surcharge un seul FE.
--
--    → Réattribution juste (charge examens ouverts + élèves en formation, comme la création
--    d’une demande) : **uniquement** l’API `POST /api/admin/reassign-open-exam-requests`
--    (dryRun puis exécution) + messages automatiques. C’est la source de vérité côté appli.
--
-- Le reste de ce fichier est laissé pour référence / requêtes ad hoc, pas pour prod.
-- =============================================================================

-- Codes examen « côté ATC / AFIS » (aligné sur instruction-permissions.ts)
-- CAL-ATC, PCAL-ATC, CAL-AFIS, PCAL-AFIS, LPAFIS, LATC

-- -----------------------------------------------------------------------------
-- A) APERÇU (lecture seule) — lancer d’abord
-- -----------------------------------------------------------------------------

WITH
flight_ex AS (
  SELECT DISTINCT l.user_id AS id
  FROM public.licences_qualifications l
  WHERE l.type = 'FE'
),
atc_ex AS (
  SELECT DISTINCT l.user_id AS id
  FROM public.licences_qualifications l
  WHERE l.type = 'ATC FE'
),
recomputed AS (
  SELECT
    r.id,
    r.licence_code,
    r.statut,
    r.instructeur_id AS old_instructeur_id,
    CASE
      WHEN r.licence_code IN (
        'CAL-ATC', 'PCAL-ATC', 'CAL-AFIS', 'PCAL-AFIS', 'LPAFIS', 'LATC'
      ) THEN
        COALESCE(
          (SELECT p.instructeur_referent_id
           FROM public.profiles p
           WHERE p.id = r.requester_id
             AND p.instructeur_referent_id IN (SELECT x.id FROM atc_ex x)),
          (SELECT a.id FROM atc_ex a ORDER BY a.id LIMIT 1)
        )
      ELSE
        COALESCE(
          (SELECT p.instructeur_referent_id
           FROM public.profiles p
           WHERE p.id = r.requester_id
             AND p.instructeur_referent_id IN (SELECT y.id FROM flight_ex y)),
          (SELECT a.id FROM flight_ex a ORDER BY a.id LIMIT 1)
        )
    END AS new_instructeur_id
  FROM public.instruction_exam_requests r
  WHERE r.statut IN ('assigne', 'accepte', 'en_cours')
)
SELECT
  c.id,
  c.licence_code,
  c.statut,
  c.old_instructeur_id,
  c.new_instructeur_id,
  po.identifiant AS old_examinateur,
  pn.identifiant AS new_examinateur
FROM recomputed c
LEFT JOIN public.profiles po ON po.id = c.old_instructeur_id
LEFT JOIN public.profiles pn ON pn.id = c.new_instructeur_id
WHERE c.new_instructeur_id IS NULL
   OR c.old_instructeur_id IS DISTINCT FROM c.new_instructeur_id
ORDER BY c.licence_code, c.id;

-- Si « new_instructeur_id » est NULL : aucun titulaire FE (vol) ou ATC FE (ATC) en base — corriger
-- avant l’UPDATE ci-dessous.

-- Variante (optionnelle) : ne réassigner que si l’examinateur actuel n’est PLUS
-- dans le pool valable. Ajouter dans le WHERE du CTE « recomputed » (aperçu) :
--   AND (
--     (licence_code IN ('CAL-ATC',...) AND r.instructeur_id NOT IN (SELECT id FROM atc_ex))
--     OR
--     (licence_code NOT IN ('CAL-ATC',...) AND (r.instructeur_id IS NULL OR r.instructeur_id NOT IN (SELECT id FROM flight_ex)))
--   )
-- (adapter la liste ATC comme dans le CASE ci-dessus.)

-- -----------------------------------------------------------------------------
-- B) MISE À JOUR (à exécuter après validation de l’aperçu)
-- Copier / exécuter le bloc ci-dessous (sans le SELECT d’aperçu du dessus) OU
-- commenter l’aperçu et n’exécuter que ce qui suit.
-- -----------------------------------------------------------------------------

/*
WITH
flight_ex AS (
  SELECT DISTINCT l.user_id AS id
  FROM public.licences_qualifications l
  WHERE l.type = 'FE'
),
atc_ex AS (
  SELECT DISTINCT l.user_id AS id
  FROM public.licences_qualifications l
  WHERE l.type = 'ATC FE'
),
recomputed AS (
  SELECT
    r.id,
    CASE
      WHEN r.licence_code IN (
        'CAL-ATC', 'PCAL-ATC', 'CAL-AFIS', 'PCAL-AFIS', 'LPAFIS', 'LATC'
      ) THEN
        COALESCE(
          (SELECT p.instructeur_referent_id
           FROM public.profiles p
           WHERE p.id = r.requester_id
             AND p.instructeur_referent_id IN (SELECT x.id FROM atc_ex x)),
          (SELECT a.id FROM atc_ex a ORDER BY a.id LIMIT 1)
        )
      ELSE
        COALESCE(
          (SELECT p.instructeur_referent_id
           FROM public.profiles p
           WHERE p.id = r.requester_id
             AND p.instructeur_referent_id IN (SELECT y.id FROM flight_ex y)),
          (SELECT a.id FROM flight_ex a ORDER BY a.id LIMIT 1)
        )
    END AS new_instructeur_id
  FROM public.instruction_exam_requests r
  WHERE r.statut IN ('assigne', 'accepte', 'en_cours')
)
UPDATE public.instruction_exam_requests u
SET
  instructeur_id = c.new_instructeur_id,
  updated_at = now()
FROM recomputed c
WHERE u.id = c.id
  AND c.new_instructeur_id IS NOT NULL
  AND (u.instructeur_id IS DISTINCT FROM c.new_instructeur_id);
*/
