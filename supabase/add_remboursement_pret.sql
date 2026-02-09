-- ============================================================
-- REMBOURSEMENT MANUEL DE PRÊT PAR LE PDG
-- ============================================================
-- Permet au PDG de contribuer au remboursement d'un prêt en ajoutant
-- de l'argent depuis le compte de la compagnie.

-- Mise à jour de la politique RLS pour permettre au PDG de mettre à jour
DROP POLICY IF EXISTS "prets_update" ON public.prets_bancaires;
CREATE POLICY "prets_update" ON public.prets_bancaires FOR UPDATE TO authenticated
  USING (public.is_pdg(compagnie_id) OR public.is_admin());

-- Message de confirmation
DO $$ BEGIN RAISE NOTICE '✅ Politique de remboursement manuel ajoutée'; END $$;
