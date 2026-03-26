-- Migration : ajout du rôle co-PDG dans compagnie_employes
-- Un co-PDG est un employé avec des droits de gestion étendus (flotte, employes, hubs, reparations)
-- mais ne peut pas fermer la compagnie ni changer le PDG.

ALTER TABLE public.compagnie_employes
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employe';

-- Contrainte pour les valeurs autorisées
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_employe_role'
  ) THEN
    ALTER TABLE public.compagnie_employes
      ADD CONSTRAINT chk_employe_role CHECK (role IN ('employe', 'co_pdg'));
  END IF;
END $$;
