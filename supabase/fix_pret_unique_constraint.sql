-- Fix : supprime la contrainte UNIQUE (compagnie_id, statut) sur prets_bancaires.
-- Cette contrainte empêche le remboursement final d'un prêt si la compagnie
-- a déjà eu un prêt antérieur (statut='rembourse').
-- La contrainte "une seule compagnie peut avoir un seul prêt actif à la fois"
-- est gérée côté application, pas en base.

ALTER TABLE public.prets_bancaires
  DROP CONSTRAINT IF EXISTS unique_pret_actif;

-- Vérification
SELECT conname FROM pg_constraint 
WHERE conrelid = 'public.prets_bancaires'::regclass;
