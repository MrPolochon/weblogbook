-- Ajoute le statut 'annule' aux plans de vol
-- À exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.plans_vol DROP CONSTRAINT IF EXISTS plans_vol_statut_check;
ALTER TABLE public.plans_vol ADD CONSTRAINT plans_vol_statut_check CHECK (statut IN (
  'depose', 'en_attente', 'accepte', 'refuse', 'annule', 'en_cours', 'automonitoring', 'en_attente_cloture', 'cloture'
));

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE 'Statut annule ajouté à la contrainte plans_vol_statut_check';
END $$;
