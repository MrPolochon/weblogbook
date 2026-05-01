-- Normalise le statut legacy `disponible` vers `ground` (canonique côté app).
-- Idempotent : les lignes déjà en `ground` ne changent pas.
-- À exécuter une fois sur la prod après déploiement du correctif UI/API.

UPDATE public.compagnie_avions
SET statut = 'ground', updated_at = now()
WHERE statut = 'disponible';

-- Optionnel : vérifier le résultat
-- SELECT count(*) FROM public.compagnie_avions WHERE statut = 'disponible';
