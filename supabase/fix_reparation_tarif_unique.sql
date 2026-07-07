-- ============================================================
-- Fix : contrainte UNIQUE(entreprise_id) sur reparation_tarifs
-- Un seul tarif de base par entreprise de réparation.
-- Les réductions alliance restent dans entreprises_reparation.prix_alliance_pourcent.
-- ============================================================

BEGIN;

-- 1) Supprimer les tarifs type-spécifiques (type_avion_id IS NOT NULL = bug)
--    Ces lignes ne devraient jamais exister dans le nouveau modèle.
DELETE FROM public.reparation_tarifs
WHERE type_avion_id IS NOT NULL;

-- 2) En cas de doublons null-null (edge case), garder uniquement le plus récent par entreprise
DELETE FROM public.reparation_tarifs
WHERE id NOT IN (
  SELECT DISTINCT ON (entreprise_id) id
  FROM public.reparation_tarifs
  ORDER BY entreprise_id, created_at DESC, id
);

-- 3) Supprimer l'ancienne contrainte composite (entreprise_id, type_avion_id)
ALTER TABLE public.reparation_tarifs
  DROP CONSTRAINT IF EXISTS reparation_tarifs_entreprise_id_type_avion_id_key;

-- 4) Ajouter la contrainte UNIQUE(entreprise_id) — un seul tarif par entreprise
ALTER TABLE public.reparation_tarifs
  ADD CONSTRAINT reparation_tarifs_entreprise_id_key UNIQUE (entreprise_id);

-- 5) Vider la colonne type_avion_id (plus utilisée)
UPDATE public.reparation_tarifs SET type_avion_id = NULL;

COMMIT;
