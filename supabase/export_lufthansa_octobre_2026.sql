-- Export Felitz en lecture seule. Les bornes du mois sont en UTC.
-- Les soldes historiques sont reconstitués à partir du solde courant et du journal.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH bornes AS (
  SELECT TIMESTAMPTZ '2026-10-01 00:00:00+00' AS debut,
         TIMESTAMPTZ '2026-11-01 00:00:00+00' AS fin
), compagnies_groupe AS (
  SELECT id, nom
  FROM public.compagnies
  WHERE regexp_replace(lower(translate(nom, 'éèêëÉÈÊË', 'eeeeEEEE')), '[^a-z0-9]', '', 'g')
    IN ('lufthansa', 'lufthansaprincipale', 'lufthansacargo', 'lufthansaregional', 'lufthansaregionale', 'lufthansagroupe', 'lufthansagroup')
), comptes_groupe AS (
  SELECT f.id, f.vban, f.solde, c.nom
  FROM public.felitz_comptes f
  JOIN compagnies_groupe c ON c.id = f.compagnie_id
  WHERE f.type = 'entreprise'
), journal AS (
  SELECT c.id AS compte, c.nom, t.id, t.type, t.libelle, t.montant, t.reference_id, t.created_at,
         CASE t.type WHEN 'credit' THEN t.montant::numeric WHEN 'debit' THEN -t.montant::numeric END AS signe
  FROM comptes_groupe c
  JOIN public.felitz_transactions t ON t.compte_id = c.id
  CROSS JOIN bornes b
  WHERE t.created_at >= b.debut
), soldes AS (
  SELECT c.nom, c.vban,
    c.solde - coalesce(sum(j.signe), 0) AS ouverture_reconstituee,
    c.solde - coalesce(sum(j.signe) FILTER (WHERE j.created_at >= b.fin), 0) AS cloture_reconstituee,
    coalesce(sum(j.montant) FILTER (WHERE j.created_at < b.fin AND j.type = 'credit'), 0) AS credits_octobre,
    coalesce(sum(j.montant) FILTER (WHERE j.created_at < b.fin AND j.type = 'debit'), 0) AS debits_octobre
  FROM comptes_groupe c CROSS JOIN bornes b
  LEFT JOIN journal j ON j.compte = c.id
  GROUP BY c.id, c.nom, c.vban, c.solde
), virements_internes AS (
  SELECT src.nom AS emetteur, dest.nom AS beneficiaire, v.montant, v.libelle, v.created_at
  FROM public.felitz_virements v
  JOIN comptes_groupe src ON src.id = v.compte_source_id
  JOIN comptes_groupe dest ON lower(dest.vban) = lower(v.compte_dest_vban)
  CROSS JOIN bornes b
  WHERE v.created_at >= b.debut AND v.created_at < b.fin
)
SELECT jsonb_build_object(
  'compagnies', coalesce((SELECT jsonb_agg(nom ORDER BY nom) FROM compagnies_groupe), '[]'::jsonb),
  'soldes', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.nom, s.vban) FROM soldes s), '[]'::jsonb),
  'journal_octobre', coalesce((
    SELECT jsonb_agg(to_jsonb(j) - 'id' - 'compte' - 'signe' ORDER BY j.created_at, j.id)
    FROM journal j CROSS JOIN bornes b WHERE j.created_at < b.fin
  ), '[]'::jsonb),
  'virements_internes_documentes', coalesce((
    SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at) FROM virements_internes v
  ), '[]'::jsonb)
) AS export_lufthansa_octobre;

COMMIT;
