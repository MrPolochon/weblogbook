-- =====================================================
-- Migration : Ajout du type de cargaison aux plans de vol
-- =====================================================
-- Ajoute une colonne type_cargaison pour les vols cargo
-- 
-- Types disponibles :
-- - 'general' : Marchandises générales (80% des vols)
-- - 'express' : Colis express (8%) - sensible au retard
-- - 'perissable' : Denrées périssables (7%) - sensible au retard
-- - 'dangereux' : Matières dangereuses (3%) - +1% bonus revenu
-- - 'surdimensionne' : Cargo surdimensionné (2%) - +1% bonus revenu
-- =====================================================

-- Ajout de la colonne type_cargaison
ALTER TABLE plans_vol 
ADD COLUMN IF NOT EXISTS type_cargaison TEXT;

-- Commentaire explicatif
COMMENT ON COLUMN plans_vol.type_cargaison IS 'Type de cargaison pour les vols cargo : general, express, perissable, dangereux, surdimensionne';

-- Index pour les requêtes filtrées par type de cargaison (optionnel)
CREATE INDEX IF NOT EXISTS idx_plans_vol_type_cargaison ON plans_vol(type_cargaison) WHERE type_cargaison IS NOT NULL;

-- Vérification
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'plans_vol' AND column_name = 'type_cargaison';
