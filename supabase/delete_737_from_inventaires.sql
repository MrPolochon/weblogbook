-- ============================================================
-- Suppression de tous les Boeing 737 des inventaires pilotes
-- (inventaire_avions = avions achetés par les pilotes, pas les flottes compagnie)
-- Inclut : Boeing 737, Boeing 737 Cargo (tout type dont le nom commence par "Boeing 737").
-- Les plans_vol référençant ces avions auront inventaire_avion_id mis à NULL (ON DELETE SET NULL).
-- Les annonces Hangar Market référençant ces avions seront supprimées (ON DELETE CASCADE).
-- À exécuter dans l'éditeur SQL Supabase (service role).
-- ============================================================

-- Optionnel : voir combien de 737 seront supprimés avant d'exécuter
-- SELECT ia.id, ia.proprietaire_id, p.identifiant, t.nom
-- FROM public.inventaire_avions ia
-- JOIN public.types_avion t ON t.id = ia.type_avion_id
-- JOIN public.profiles p ON p.id = ia.proprietaire_id
-- WHERE t.nom LIKE 'Boeing 737%';

DELETE FROM public.inventaire_avions
WHERE type_avion_id IN (
  SELECT id FROM public.types_avion WHERE nom LIKE 'Boeing 737%'
);

-- Vérification : plus aucun 737 dans les inventaires
-- SELECT count(*) FROM public.inventaire_avions ia
-- JOIN public.types_avion t ON t.id = ia.type_avion_id
-- WHERE t.nom LIKE 'Boeing 737%';
