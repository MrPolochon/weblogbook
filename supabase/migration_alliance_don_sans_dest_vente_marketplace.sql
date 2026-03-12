-- ============================================================
-- Don sans destinataire + Vente marketplace alliance
-- ============================================================
-- 1. Don : compagnie_dest_id nullable → tout le monde peut claim
-- 2. Vente : idem, mise en vente dans l'alliance (comme Hangar Market)
-- 3. Même avion peut être en vente sur Hangar Market ET alliance (prix différents)
-- ============================================================

-- Rendre compagnie_dest_id nullable (pour don/vente sans destinataire)
ALTER TABLE public.alliance_transferts_avions
  ALTER COLUMN compagnie_dest_id DROP NOT NULL;

-- Ajouter statut 'annule' pour transferts annulés (ex: avion vendu ailleurs)
ALTER TABLE public.alliance_transferts_avions
  DROP CONSTRAINT IF EXISTS alliance_transferts_avions_statut_check;

ALTER TABLE public.alliance_transferts_avions
  ADD CONSTRAINT alliance_transferts_avions_statut_check
  CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'complete', 'retourne', 'annule'));

COMMENT ON COLUMN public.alliance_transferts_avions.compagnie_dest_id IS 'Null = don/vente sans destinataire, tout membre peut claim/acheter';
