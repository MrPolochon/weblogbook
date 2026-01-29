-- ============================================================
-- AJOUT DU SYSTÈME DE VOLS FERRY AUTOMATIQUES
-- ============================================================
-- Les PDG peuvent lancer des vols ferry automatiques (sans pilote)
-- qui coûtent plus cher (50K-300K) mais se complètent tout seuls.

-- Ajouter les colonnes pour les vols ferry automatiques
ALTER TABLE vols_ferry
ADD COLUMN IF NOT EXISTS automatique BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duree_prevue_min INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fin_prevue_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Index pour les recherches de vols auto à compléter
CREATE INDEX IF NOT EXISTS idx_vols_ferry_auto_pending 
ON vols_ferry(compagnie_id, automatique, statut, fin_prevue_at)
WHERE automatique = TRUE AND statut IN ('planned', 'in_progress');

-- Commentaires
COMMENT ON COLUMN vols_ferry.automatique IS 'Vol ferry sans pilote (50K-300K F$, 30min-3h)';
COMMENT ON COLUMN vols_ferry.duree_prevue_min IS 'Durée prévue du vol ferry automatique en minutes';
COMMENT ON COLUMN vols_ferry.fin_prevue_at IS 'Date/heure de fin prévue pour le vol automatique';
COMMENT ON COLUMN vols_ferry.completed_at IS 'Date/heure de complétion effective';
