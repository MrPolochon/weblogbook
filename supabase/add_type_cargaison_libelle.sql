-- =====================================================
-- Migration : Libellé de la marchandise rare
-- =====================================================
-- Quand type_cargaison = 'marchandise_rare', on stocke le type exact
-- (ex: "Voiture de luxe", "Vaccins") pour l'afficher au pilote.
-- =====================================================

ALTER TABLE plans_vol
ADD COLUMN IF NOT EXISTS type_cargaison_libelle TEXT;

COMMENT ON COLUMN plans_vol.type_cargaison_libelle IS 'Libellé affiché quand type_cargaison = marchandise_rare (ex: Voiture de luxe, Vaccins)';
