-- ============================================================
-- Reparation manuelle : avions compagnie bloques en `en_transit`
-- ============================================================
--
-- Contexte : `compagnie_avions.statut` n'est mis a `en_transit` que par le
-- flux reparations (PATCH /api/reparation/demandes/[id] action ferry, et le
-- cron `processDueRetourTransits`). Si la `reparation_demandes` correspondante
-- a ete cloturee, supprimee ou n'a jamais bouge alors que son ETA est passee
-- depuis longtemps, l'avion peut rester `en_transit` "pour toujours".
--
-- Le code applicatif a ete patche pour auto-healer ces cas a chaque chargement
-- de la flotte (GET /api/compagnies/avions appelle desormais
-- `processDueRetourTransits` + `processDueEntrepriseTransits`).
--
-- CE SCRIPT s'occupe des avions deja bloques (ex. C-IHSV stuck depuis 3j) :
--   1. Pour ceux dont une demande `retour_transit` existe avec ETA depassee
--      → on cloture la demande et on remet l'avion `disponible`.
--   2. Pour les "orphelins" (statut `en_transit` mais aucune demande active
--      en transit) → on les remet `disponible` directement (a leur derniere
--      base connue ou base resolue par les hubs).
--
-- A executer manuellement dans l'editeur SQL Supabase. Idempotent.
-- ============================================================

-- 1) Cloturer les demandes "retour_transit" dont l'ETA est passee
--    et debloquer l'avion correspondant.
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
SET statut = 'disponible',
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
  AND ca.statut = 'en_transit';

-- 2) Cas orphelins : avion `en_transit` sans aucune demande "transit" active.
UPDATE public.compagnie_avions ca
SET statut = 'disponible'
WHERE ca.statut = 'en_transit'
  AND NOT EXISTS (
    SELECT 1 FROM public.reparation_demandes rd
    WHERE rd.avion_id = ca.id
      AND rd.statut IN ('en_transit', 'retour_transit')
  );

-- 3) Verification : il ne devrait plus rester d'avion en_transit sans ETA active.
SELECT ca.id, ca.immatriculation, ca.statut, ca.aeroport_actuel,
       rd.statut AS demande_statut, rd.retour_transit_eta_at, rd.entreprise_transit_eta_at
FROM public.compagnie_avions ca
LEFT JOIN public.reparation_demandes rd
  ON rd.avion_id = ca.id AND rd.statut IN ('en_transit','retour_transit')
WHERE ca.statut = 'en_transit'
ORDER BY ca.immatriculation;
