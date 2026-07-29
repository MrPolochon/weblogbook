-- ============================================================
-- ADMIN — Suppression des logos de compagnie orphelins (Storage)
-- Exécuté en production le 2026-07-29 (projet iajcynzzybkomaouxwji)
-- ============================================================
-- Contexte :
--   - Logos stockés dans le bucket Supabase Storage `cartes-identite`
--     sous `compagnies/{compagnie_id}/logo-{timestamp}.{ext}`
--   - URL canonique référencée dans `compagnies.logo_url`
--     (propagée aux `cartes_identite.logo_url` des employés/PDG)
--
-- Orphelin = fichier Storage dont :
--   1) l'UUID du dossier parent n'existe plus dans `compagnies`, ET
--   2) le chemin n'est référencé ni par `compagnies.logo_url`
--      ni par `cartes_identite.logo_url`
--
-- Résultat exécution 2026-07-29 :
--   - 26 fichiers supprimés (compagnies supprimées, logos non référencés)
--   - 23 fichiers conservés (logos actifs de compagnies existantes)
-- ============================================================

-- --- 1) Audit (lecture seule) --------------------------------

WITH storage_logos AS (
  SELECT
    o.name,
    split_part(o.name, '/', 2) AS compagnie_id_from_path
  FROM storage.objects o
  WHERE o.bucket_id = 'cartes-identite'
    AND o.name LIKE 'compagnies/%'
),
referenced AS (
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM compagnies
  WHERE logo_url IS NOT NULL AND logo_url <> ''
  UNION
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM cartes_identite
  WHERE logo_url IS NOT NULL AND logo_url <> ''
    AND logo_url LIKE '%/cartes-identite/compagnies/%'
)
SELECT
  (SELECT COUNT(*) FROM storage_logos) AS total_storage,
  (SELECT COUNT(*) FROM storage_logos s
     LEFT JOIN compagnies c ON c.id::text = s.compagnie_id_from_path
     WHERE c.id IS NULL) AS orphans_no_company,
  (SELECT COUNT(*) FROM storage_logos s
     WHERE s.name NOT IN (SELECT storage_path FROM referenced WHERE storage_path IS NOT NULL)) AS orphans_unreferenced,
  (SELECT COUNT(*) FROM storage_logos s
     WHERE s.name IN (SELECT storage_path FROM referenced WHERE storage_path IS NOT NULL)) AS referenced_in_db;

-- Échantillon des orphelins (avant suppression) :
-- WITH storage_logos AS ( ... même CTE que ci-dessus ... )
-- SELECT s.name, s.compagnie_id_from_path
-- FROM storage_logos s
-- LEFT JOIN compagnies c ON c.id::text = s.compagnie_id_from_path
-- WHERE c.id IS NULL
-- ORDER BY s.name;

-- --- 2) Suppression sécurisée --------------------------------

BEGIN;
SET LOCAL storage.allow_delete_query = 'true';

WITH referenced AS (
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM compagnies
  WHERE logo_url IS NOT NULL AND logo_url <> ''
  UNION
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM cartes_identite
  WHERE logo_url IS NOT NULL AND logo_url <> ''
    AND logo_url LIKE '%/cartes-identite/compagnies/%'
),
to_delete AS (
  SELECT o.id, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'cartes-identite'
    AND o.name LIKE 'compagnies/%'
    AND split_part(o.name, '/', 2) NOT IN (SELECT id::text FROM compagnies)
    AND o.name NOT IN (SELECT storage_path FROM referenced WHERE storage_path IS NOT NULL)
)
DELETE FROM storage.objects o
USING to_delete d
WHERE o.id = d.id
RETURNING o.name;

COMMIT;

-- --- 3) Vérification post-nettoyage --------------------------

WITH storage_logos AS (
  SELECT o.name, split_part(o.name, '/', 2) AS compagnie_id_from_path
  FROM storage.objects o
  WHERE o.bucket_id = 'cartes-identite' AND o.name LIKE 'compagnies/%'
),
referenced AS (
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM compagnies WHERE logo_url IS NOT NULL AND logo_url <> ''
  UNION
  SELECT DISTINCT split_part(substring(logo_url FROM 'cartes-identite/(.+)$'), '?', 1) AS storage_path
  FROM cartes_identite
  WHERE logo_url IS NOT NULL AND logo_url <> ''
    AND logo_url LIKE '%/cartes-identite/compagnies/%'
)
SELECT
  (SELECT COUNT(*) FROM storage_logos) AS remaining_storage,
  (SELECT COUNT(*) FROM compagnies WHERE logo_url IS NOT NULL AND logo_url <> '') AS compagnies_avec_logo,
  (SELECT COUNT(*) FROM storage_logos s
     LEFT JOIN compagnies c ON c.id::text = s.compagnie_id_from_path
     WHERE c.id IS NULL) AS orphans_no_company,
  (SELECT COUNT(*) FROM storage_logos s
     WHERE s.name NOT IN (SELECT storage_path FROM referenced WHERE storage_path IS NOT NULL)) AS orphans_unreferenced;
-- Attendu : remaining_storage = compagnies_avec_logo, orphans = 0
