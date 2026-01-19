-- Statuts « en attente confirmation » : pilote ou copilote doit confirmer avant envoi aux admins
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.vols DROP CONSTRAINT IF EXISTS vols_statut_check;
ALTER TABLE public.vols ADD CONSTRAINT vols_statut_check
  CHECK (statut IN ('en_attente', 'validé', 'refusé', 'en_attente_confirmation_pilote', 'en_attente_confirmation_copilote', 'refuse_par_copilote', 'en_attente_confirmation_instructeur'));
