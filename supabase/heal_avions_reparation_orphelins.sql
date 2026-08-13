-- ============================================================
-- Heal : avions bloqués en réparation / transit sans demande
-- ============================================================
--
-- Contexte : `reparation_demandes.hangar_id` est ON DELETE CASCADE.
-- La suppression d'un hangar (ou d'une entreprise) effaçait les demandes
-- et laissait `compagnie_avions.statut` à `en_reparation` / `en_transit`.
-- L'avion restait inutilisable (plans de vol / ferry refusés) — « disparu »
-- du point de vue opérationnel.
--
-- Le code applicatif auto-heale désormais via
-- `healCompagnieAvionsReparationStatuts` (GET flotte + cron).
--
-- CE SCRIPT répare les données déjà corrompues en prod. Idempotent.
-- ============================================================

-- 1) Clôturer les retours transit dont l'ETA est passée
WITH due AS (
  SELECT rd.id AS demande_id, rd.avion_id, rd.compagnie_id, rd.aeroport_depart_client
  FROM public.reparation_demandes rd
  WHERE rd.statut = 'retour_transit'
    AND rd.retour_transit_eta_at IS NOT NULL
    AND rd.retour_transit_eta_at <= now()
), updated_demandes AS (
  UPDATE public.reparation_demandes rd
  SET statut = 'completee', completee_at = now(), retour_transit_eta_at = NULL
  FROM due
  WHERE rd.id = due.demande_id
  RETURNING rd.avion_id, due.aeroport_depart_client, due.compagnie_id
)
UPDATE public.compagnie_avions ca
SET statut = 'ground',
    aeroport_actuel = COALESCE(
      ud.aeroport_depart_client,
      (
        SELECT aeroport_code FROM public.compagnie_hubs
        WHERE compagnie_id = ud.compagnie_id AND est_hub_principal = TRUE
        LIMIT 1
      ),
      ca.aeroport_actuel
    )
FROM updated_demandes ud
WHERE ca.id = ud.avion_id
  AND ca.statut IN ('en_transit', 'en_reparation', 'disponible');

-- 2) Arrivées hangar dont l'ETA entreprise est passée
WITH due AS (
  SELECT rd.id AS demande_id, rd.avion_id, h.aeroport_code
  FROM public.reparation_demandes rd
  JOIN public.reparation_hangars h ON h.id = rd.hangar_id
  WHERE rd.statut = 'en_transit'
    AND rd.entreprise_transit_eta_at IS NOT NULL
    AND rd.entreprise_transit_eta_at <= now()
), updated_demandes AS (
  UPDATE public.reparation_demandes rd
  SET statut = 'en_reparation',
      debut_reparation_at = COALESCE(rd.debut_reparation_at, now()),
      entreprise_transit_eta_at = NULL
  FROM due
  WHERE rd.id = due.demande_id
  RETURNING rd.avion_id, due.aeroport_code
)
UPDATE public.compagnie_avions ca
SET statut = 'en_reparation',
    aeroport_actuel = COALESCE(ud.aeroport_code, ca.aeroport_actuel)
FROM updated_demandes ud
WHERE ca.id = ud.avion_id;

-- 3) Orphelins : statut réparation/transit SANS demande active
UPDATE public.compagnie_avions ca
SET statut = 'ground'
WHERE ca.statut IN ('en_reparation', 'en_transit')
  AND NOT EXISTS (
    SELECT 1 FROM public.reparation_demandes rd
    WHERE rd.avion_id = ca.id
      AND rd.statut IN (
        'demandee', 'acceptee', 'en_transit', 'en_reparation', 'mini_jeux',
        'terminee', 'facturee', 'payee', 'retour_transit'
      )
  );

-- 4) Resync : demandes transit actives → avion en_transit
UPDATE public.compagnie_avions ca
SET statut = 'en_transit'
WHERE ca.statut IS DISTINCT FROM 'en_transit'
  AND EXISTS (
    SELECT 1 FROM public.reparation_demandes rd
    WHERE rd.avion_id = ca.id
      AND rd.statut IN ('en_transit', 'retour_transit')
  );

-- 5) Resync : demandes au hangar → avion en_reparation
UPDATE public.compagnie_avions ca
SET statut = 'en_reparation'
WHERE ca.statut IS DISTINCT FROM 'en_reparation'
  AND NOT EXISTS (
    SELECT 1 FROM public.reparation_demandes rd
    WHERE rd.avion_id = ca.id AND rd.statut IN ('en_transit', 'retour_transit')
  )
  AND EXISTS (
    SELECT 1 FROM public.reparation_demandes rd
    WHERE rd.avion_id = ca.id
      AND rd.statut IN ('en_reparation', 'mini_jeux', 'terminee', 'facturee', 'payee')
  );

-- 6) Vérification
SELECT ca.id, ca.immatriculation, ca.statut, ca.aeroport_actuel, ca.usure_percent,
       rd.statut AS demande_statut, rd.hangar_id
FROM public.compagnie_avions ca
LEFT JOIN public.reparation_demandes rd
  ON rd.avion_id = ca.id
 AND rd.statut IN (
   'demandee', 'acceptee', 'en_transit', 'en_reparation', 'mini_jeux',
   'terminee', 'facturee', 'payee', 'retour_transit'
 )
WHERE ca.statut IN ('en_reparation', 'en_transit')
ORDER BY ca.immatriculation;
