-- Migration: Ajouter la colonne created_by_atc pour les plans de vol créés par les ATC
-- Date: 2026-01-26

-- Ajouter la colonne created_by_atc pour marquer les plans créés par les ATC
ALTER TABLE plans_vol
ADD COLUMN IF NOT EXISTS created_by_atc BOOLEAN DEFAULT FALSE;

-- Commentaire
COMMENT ON COLUMN plans_vol.created_by_atc IS 'Indique si le plan a été créé manuellement par un ATC';
