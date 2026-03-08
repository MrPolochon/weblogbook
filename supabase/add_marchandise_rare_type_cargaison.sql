-- =====================================================
-- Migration optionnelle : Documenter la valeur marchandise_rare
-- =====================================================
-- Aucune modification de schéma : type_cargaison est déjà TEXT.
-- On met à jour uniquement le commentaire pour lister la nouvelle valeur.
-- =====================================================

COMMENT ON COLUMN plans_vol.type_cargaison IS 'Type de cargaison : general, express, perissable, dangereux, surdimensionne ; ou marchandise_rare (cargo complémentaire vols passagers, 1% chance, +30% bonus)';
