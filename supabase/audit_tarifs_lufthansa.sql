-- Export de tarification en lecture seule. Une liaison est orientée.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH filiales AS (
  SELECT id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire
  FROM public.compagnies
  WHERE regexp_replace(lower(translate(nom, 'éèêëÉÈÊË', 'eeeeEEEE')), '[^a-z0-9]', '', 'g')
    IN ('lufthansa', 'lufthansaprincipale', 'lufthansacargo', 'lufthansaregional', 'lufthansaregionale')
), tarifs AS (
  SELECT f.nom, t.aeroport_depart, t.aeroport_arrivee, t.prix_billet
  FROM public.tarifs_liaisons t
  JOIN filiales f ON f.id = t.compagnie_id
), historique AS (
  SELECT f.nom, p.aeroport_depart, p.aeroport_arrivee, p.nature_transport,
    p.cloture_at, p.economy_version, a.nom AS appareil,
    a.capacite_pax, a.capacite_cargo_kg,
    p.nb_pax_genere, p.cargo_kg_genere,
    coalesce(s.detail->>'ticket_price', p.economy_snapshot->>'ticket_price', p.prix_billet_utilise::text) AS tarif_enregistre,
    p.economy_snapshot->>'cargo_price' AS tarif_fret_kg_snapshot,
    p.economy_snapshot->>'seat_ratio' AS capacite_cabine_conservee,
    p.revenue_brut, p.revenue_effectif, p.revenue_net, p.salaire_pilote,
    s.detail->'actual_minutes' AS minutes_vol,
    s.detail->'delay_minutes' AS retard_minutes,
    s.detail->'fuel_cost' AS carburant,
    s.detail->'airport_tax' AS taxes,
    s.detail->'alliance_tax' AS taxe_alliance,
    s.detail->'codeshare' AS partage_code,
    s.detail->'royalty' AS redevance_location,
    s.detail->'loan_repayment' AS remboursement_pret,
    p.deroutement_at IS NOT NULL AS deroute
  FROM public.plans_vol p
  JOIN filiales f ON f.id = p.compagnie_id
  LEFT JOIN public.types_avion a ON a.id = p.type_avion_id
  LEFT JOIN public.flight_economy_settlements s ON s.plan_id = p.id
  WHERE p.vol_commercial AND p.statut = 'cloture'
    AND p.cloture_at >= TIMESTAMPTZ '2026-10-01 00:00:00+00'
), codes AS (
  SELECT aeroport_depart AS code FROM historique UNION SELECT aeroport_arrivee FROM historique
  UNION SELECT aeroport_depart FROM tarifs UNION SELECT aeroport_arrivee FROM tarifs
), stocks AS (
  SELECT a.code_oaci, a.passagers_disponibles, a.passagers_max,
    a.cargo_disponible, a.cargo_max, a.last_flight_arrival
  FROM public.aeroports a JOIN codes c ON c.code = a.code_oaci
)
SELECT jsonb_build_object(
  'releve_le', now(),
  'filiales', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'id' ORDER BY f.nom) FROM filiales f), '[]'::jsonb),
  'tarifs_par_liaison', coalesce((SELECT jsonb_agg(t ORDER BY t.nom,t.aeroport_depart,t.aeroport_arrivee) FROM tarifs t), '[]'::jsonb),
  'vols_clotures', coalesce((SELECT jsonb_agg(h ORDER BY h.cloture_at) FROM historique h), '[]'::jsonb),
  'stocks_actuels', coalesce((SELECT jsonb_agg(s ORDER BY s.code_oaci) FROM stocks s), '[]'::jsonb)
) AS audit_tarifs_lufthansa;

COMMIT;
