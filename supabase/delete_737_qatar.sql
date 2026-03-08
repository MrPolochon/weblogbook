-- ============================================================
-- Suppression de tous les Boeing 737 de la compagnie Qatar
-- (avions de la flotte compagnie : compagnie_avions)
-- À exécuter dans l'éditeur SQL Supabase (service role).
-- ============================================================

-- Optionnel : voir les avions qui seront supprimés
-- SELECT ca.id, ca.immatriculation, t.nom, c.nom AS compagnie
-- FROM public.compagnie_avions ca
-- JOIN public.types_avion t ON t.id = ca.type_avion_id
-- JOIN public.compagnies c ON c.id = ca.compagnie_id
-- WHERE c.nom ILIKE '%qatar%'
--   AND t.nom LIKE 'Boeing 737%';

DELETE FROM public.compagnie_avions
WHERE compagnie_id IN (SELECT id FROM public.compagnies WHERE nom ILIKE '%qatar%')
  AND type_avion_id IN (SELECT id FROM public.types_avion WHERE nom LIKE 'Boeing 737%');

-- Vérification : plus aucun 737 pour Qatar
-- SELECT count(*) FROM public.compagnie_avions ca
-- JOIN public.types_avion t ON t.id = ca.type_avion_id
-- JOIN public.compagnies c ON c.id = ca.compagnie_id
-- WHERE c.nom ILIKE '%qatar%' AND t.nom LIKE 'Boeing 737%';
