-- Ajout du prix d'achat reel sur les avions (pour calcul revente equitable)
ALTER TABLE public.compagnie_avions
  ADD COLUMN IF NOT EXISTS prix_achat INTEGER;

ALTER TABLE public.inventaire_avions
  ADD COLUMN IF NOT EXISTS prix_achat INTEGER;

-- Pour les avions existants sans prix_achat, on met le prix catalogue par defaut
UPDATE public.compagnie_avions ca
  SET prix_achat = ta.prix
  FROM public.types_avion ta
  WHERE ca.type_avion_id = ta.id AND ca.prix_achat IS NULL;

UPDATE public.inventaire_avions ia
  SET prix_achat = ta.prix
  FROM public.types_avion ta
  WHERE ia.type_avion_id = ta.id AND ia.prix_achat IS NULL;
