-- Read-only checks before installing migrations. No data or permissions changed.
BEGIN READ ONLY;
-- Every row returned here must be resolved before installation.
WITH required(table_name,column_name) AS (VALUES
 ('plans_vol','pilote_id'),('plans_vol','copilote_id'),('plans_vol','compagnie_avion_id'),
 ('plans_vol','inventaire_avion_id'),('plans_vol','nature_transport'),('plans_vol','revenue_brut'),
 ('plans_vol','vol_commercial'),('plans_vol','vol_ferry'),('plans_vol','armee_avion_id'),
 ('vols','pilote_id'),('vols','statut'),('vols','type_avion_id'),('vols','depart_utc'),
 ('compagnies','prix_billet_pax'),('compagnies','prix_kg_cargo'),('compagnies','pourcentage_salaire'),
 ('compagnie_avions','type_avion_id'),('compagnie_avions','usure_percent'),
 ('compagnie_locations','last_billed_at'),('compagnie_locations','start_at'),('compagnie_locations','end_at'),
 ('compagnie_locations','prix_journalier'),('compagnie_locations','pourcentage_revenu_loueur'),
 ('inventaire_avions','proprietaire_id'),('aeroports','passagers_disponibles'),('aeroports','cargo_disponible'),
 ('aeroports','passagers_max'),('aeroports','cargo_max'),('aeroports','last_flight_arrival'),
 ('taxes_aeroport','taxe_pourcent'),('taxes_aeroport','taxe_vfr_pourcent'),
 ('felitz_comptes','created_at'),('felitz_transactions','compte_id'),('reparation_demandes','avion_id'),
 ('vols_ferry','avion_id'),('alliance_parametres','pret_avions_actif'),
 ('hangar_market_reventes','demandeur_id'),('hangar_market_reventes','statut'),
 ('inventaire_avions','instruction_session_id'),('inventaire_avions','instruction_actif'),
 ('inventaire_avions','instruction_lifecycle'))
SELECT r.* FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
WHERE c.column_name IS NULL;

-- Inspect unusual legacy aircraft states and duplicate enterprise accounts.
SELECT statut,count(*) FROM public.compagnie_avions GROUP BY statut ORDER BY statut;
SELECT compagnie_id,count(*) FROM public.felitz_comptes WHERE type='entreprise' GROUP BY compagnie_id HAVING count(*)>1;
SELECT c.id FROM public.compagnies c WHERE NOT EXISTS(SELECT 1 FROM public.felitz_comptes f WHERE f.compagnie_id=c.id AND f.type='entreprise');
-- Resolve Mellor's ILMR / IMLR discrepancy explicitly; never silently rename staff rates.
SELECT code_oaci,taxe_pourcent,taxe_vfr_pourcent FROM public.taxes_aeroport
 WHERE code_oaci IN ('ILMR','IMLR') OR taxe_pourcent<0 OR taxe_pourcent>100 OR taxe_vfr_pourcent<0 OR taxe_vfr_pourcent>100;
-- Record existing pending/validated history; no deletion or automatic consolidation is planned.
SELECT statut,count(*) FROM public.vols GROUP BY statut ORDER BY statut;
ROLLBACK;
