-- Ajoute le statut 'en_attente_cloture' aux plans de vol (demande de clôture par le pilote, en attente de confirmation ATC)
-- À exécuter dans l'éditeur SQL Supabase si la table plans_vol existe déjà.

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut IN (
  'depose', 'en_attente', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture'
));
