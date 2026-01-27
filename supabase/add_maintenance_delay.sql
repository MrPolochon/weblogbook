-- Migration: Ajouter le délai de maintenance pour les techniciens affrétés
-- Date: 2026-01-26

-- Ajouter la colonne maintenance_fin_at pour gérer le délai d'affrètement des techniciens
ALTER TABLE compagnie_avions
ADD COLUMN IF NOT EXISTS maintenance_fin_at TIMESTAMPTZ DEFAULT NULL;

-- Commentaire
COMMENT ON COLUMN compagnie_avions.maintenance_fin_at IS 'Date de fin de maintenance lorsque des techniciens sont affrétés';
