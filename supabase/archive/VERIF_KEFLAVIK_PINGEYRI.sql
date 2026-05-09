-- ============================================================
-- VÉRIFICATION : reste-t-il des références à 'IGRV' en base ?
-- ============================================================
-- À exécuter APRÈS MIGRATION_KEFLAVIK_PINGEYRI.sql
-- 100% SQL plat, aucun DO, aucune fonction, aucun INTO :
-- compatible avec n'importe quel éditeur SQL.
--
-- ⚠️ Si une table parmi celles ci-dessous n'existe pas dans votre DB,
-- la requête plantera avec "relation X does not exist".
-- → Dans ce cas, COMMENTEZ la ligne correspondante (préfixez-la par --)
--   et relancez. Une table absente = migration jamais exécutée pour
--   cette feature → c'est normal qu'elle n'existe pas chez vous.
-- ============================================================

-- ============================================================
-- A) Tableau de bord IGRV : 1 ligne, N colonnes (1 par table)
-- ============================================================
-- Toutes les valeurs doivent être à 0. Si l'une est > 0, il reste
-- du IGRV dans cette table → me la signaler.

SELECT
  -- Tables CORE (toujours présentes)
  (SELECT COUNT(*) FROM public.sid_star WHERE aeroport = 'IGRV')                                                AS sid_star,
  (SELECT COUNT(*) FROM public.vols WHERE aeroport_depart = 'IGRV' OR aeroport_arrivee = 'IGRV')                AS vols,
  (SELECT COUNT(*) FROM public.plans_vol WHERE aeroport_depart = 'IGRV' OR aeroport_arrivee = 'IGRV')           AS plans_vol,
  (SELECT COUNT(*) FROM public.aeroport_passagers WHERE code_oaci = 'IGRV')                                     AS aeroport_passagers,
  (SELECT COUNT(*) FROM public.aeroport_cargo WHERE code_oaci = 'IGRV')                                         AS aeroport_cargo,
  (SELECT COUNT(*) FROM public.vhf_position_frequencies WHERE aeroport = 'IGRV')                                AS vhf_freq,
  (SELECT COUNT(*) FROM public.compagnie_hubs WHERE aeroport_code = 'IGRV')                                     AS compagnie_hubs,
  (SELECT COUNT(*) FROM public.compagnie_avions WHERE aeroport_actuel = 'IGRV')                                 AS compagnie_avions,
  (SELECT COUNT(*) FROM public.inventaire_avions WHERE aeroport_actuel = 'IGRV')                                AS inventaire_avions,
  (SELECT COUNT(*) FROM public.vols_ferry WHERE aeroport_depart = 'IGRV' OR aeroport_arrivee = 'IGRV')          AS vols_ferry,
  (SELECT COUNT(*) FROM public.tarifs_liaisons WHERE aeroport_depart = 'IGRV' OR aeroport_arrivee = 'IGRV')     AS tarifs_liaisons,
  (SELECT COUNT(*) FROM public.atc_sessions WHERE aeroport = 'IGRV')                                            AS atc_sessions,
  (SELECT COUNT(*) FROM public.notams WHERE code_aeroport = 'IGRV')                                             AS notams
;


-- ============================================================
-- B) Récap des nouveautés (ITEY + SID Keflavik)
-- ============================================================
-- Toutes les valeurs doivent être > 0.

SELECT
  (SELECT COUNT(*) FROM public.aeroport_passagers WHERE code_oaci = 'ITEY')                                     AS itey_passagers,
  (SELECT COUNT(*) FROM public.aeroport_cargo WHERE code_oaci = 'ITEY')                                         AS itey_cargo,
  (SELECT COUNT(*) FROM public.vhf_position_frequencies WHERE aeroport = 'ITEY')                                AS itey_vhf,
  (SELECT COUNT(*) FROM public.sid_star WHERE aeroport = 'IKFL' AND nom IN ('KEFLAVIK 1', 'KEFLAVIK 2'))        AS sid_keflavik
;


-- ============================================================
-- C) Tables OPTIONNELLES (à n'utiliser QUE si vous avez exécuté
--    les migrations correspondantes)
-- ============================================================
-- ⚠️ Décommentez UNIQUEMENT les lignes des tables qui existent
-- dans votre DB. Sinon, vous aurez "relation X does not exist".

/*
SELECT
  -- Décommenter selon ce que vous avez en base :

  -- Si add_siavi_system.sql exécuté :
  -- (SELECT COUNT(*) FROM public.siavi_sessions     WHERE aeroport = 'IGRV')       AS siavi_sessions,
  -- (SELECT COUNT(*) FROM public.afis_sessions      WHERE aeroport = 'IGRV')       AS afis_sessions,
  -- (SELECT COUNT(*) FROM public.siavi_interventions WHERE aeroport = 'IGRV')      AS siavi_interventions,

  -- Si add_atc_taxes_salaires.sql exécuté :
  -- (SELECT COUNT(*) FROM public.atc_taxes_pending  WHERE aeroport = 'IGRV')       AS atc_taxes_pending,
  -- (SELECT COUNT(*) FROM public.atc_plans_controles WHERE aeroport = 'IGRV')      AS atc_plans_controles,

  -- Si add_atis_broadcast.sql exécuté :
  -- (SELECT COUNT(*) FROM public.atis_broadcast_state WHERE aeroport = 'IGRV')     AS atis_broadcast,

  -- Si add_incidents_vol.sql exécuté :
  -- (SELECT COUNT(*) FROM public.incidents_vol WHERE aeroport_depart = 'IGRV' OR aeroport_arrivee = 'IGRV' OR aeroport_incident = 'IGRV')  AS incidents_vol,

  -- Si add_felitz_bank_system.sql exécuté :
  -- (SELECT COUNT(*) FROM public.taxes_aeroport WHERE code_oaci = 'IGRV')          AS taxes_aeroport,

  -- Si add_plans_vol_pending_transfer.sql exécuté :
  -- (SELECT COUNT(*) FROM public.plans_vol WHERE pending_transfer_aeroport = 'IGRV') AS pending_transfer,
  -- (SELECT COUNT(*) FROM public.plans_vol WHERE current_holder_aeroport = 'IGRV')   AS current_holder,

  1 AS placeholder
;
*/
