-- ============================================================
-- SYSTÈME AVION DÉTRUIT
-- Permet aux admins de marquer un avion comme détruit suite à un crash
-- ============================================================

-- 1) Ajouter les colonnes pour le statut détruit
ALTER TABLE compagnie_avions
ADD COLUMN IF NOT EXISTS detruit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS detruit_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS detruit_par_id UUID REFERENCES profiles(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS detruit_raison TEXT DEFAULT NULL;

-- 2) Index pour rechercher les avions détruits
CREATE INDEX IF NOT EXISTS idx_compagnie_avions_detruit ON compagnie_avions(detruit) WHERE detruit = TRUE;

-- 3) Commentaires
COMMENT ON COLUMN compagnie_avions.detruit IS 'Indique si l''avion a été détruit (crash, etc.)';
COMMENT ON COLUMN compagnie_avions.detruit_at IS 'Date de la destruction de l''avion';
COMMENT ON COLUMN compagnie_avions.detruit_par_id IS 'ID de l''admin qui a marqué l''avion comme détruit';
COMMENT ON COLUMN compagnie_avions.detruit_raison IS 'Raison de la destruction (crash, accident, etc.)';
