-- ============================================================
-- WARN rls_policy_always_true (0024) + authenticated SECURITY
-- DEFINER RPC sur is_admin / is_pdg (0029).
--
-- Remplace les politiques INSERT/UPDATE/DELETE « true » listées
-- par le linter (alliances, réparation, incidents_vol, siavi).
-- is_admin / is_pdg : SECURITY INVOKER + search_path figé (équiv.
-- logique, plus d’élévation de privilège).
-- ============================================================

-- ---------------------------------------------------------------------------
-- Helpers : mêmes motifs que MIGRATION_ALLIANCES_REPARATION (JWT utilisateur)
-- ---------------------------------------------------------------------------
-- Compagnies liées à l’utilisateur (PDG ou employé pilote)
-- (inline dans chaque politique pour éviter une fonction SECURITY DEFINER)

-- ---------------------------------------------------------------------------
-- 1) is_admin, is_pdg : INVOKER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_pdg(comp_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.compagnies
    WHERE id = comp_id AND pdg_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) Alliances — remplacer les politiques permissives
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "alliance_annonces_insert" ON public.alliance_annonces;
CREATE POLICY "alliance_annonces_insert" ON public.alliance_annonces
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      auteur_id = auth.uid()
      AND alliance_id IN (
        SELECT am.alliance_id FROM public.alliance_membres am
        WHERE am.compagnie_id IN (
          SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
          UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "alliance_contributions_insert" ON public.alliance_contributions;
CREATE POLICY "alliance_contributions_insert" ON public.alliance_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND alliance_id IN (
        SELECT am.alliance_id FROM public.alliance_membres am
        WHERE am.compagnie_id = alliance_contributions.compagnie_id
      )
    )
  );

DROP POLICY IF EXISTS "alliance_demandes_fonds_insert" ON public.alliance_demandes_fonds;
CREATE POLICY "alliance_demandes_fonds_insert" ON public.alliance_demandes_fonds
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND alliance_id IN (
        SELECT am.alliance_id FROM public.alliance_membres am
        WHERE am.compagnie_id = alliance_demandes_fonds.compagnie_id
      )
    )
  );

DROP POLICY IF EXISTS "alliance_demandes_fonds_update" ON public.alliance_demandes_fonds;
CREATE POLICY "alliance_demandes_fonds_update" ON public.alliance_demandes_fonds
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR alliance_demandes_fonds.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_membres am
      WHERE am.alliance_id = alliance_demandes_fonds.alliance_id
      AND am.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND am.role IN ('president', 'vice_president', 'secretaire')
    )
  )
  WITH CHECK (
    public.is_admin()
    OR alliance_demandes_fonds.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_membres am
      WHERE am.alliance_id = alliance_demandes_fonds.alliance_id
      AND am.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND am.role IN ('president', 'vice_president', 'secretaire')
    )
  );

DROP POLICY IF EXISTS "alliance_invitations_insert" ON public.alliance_invitations;
CREATE POLICY "alliance_invitations_insert" ON public.alliance_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invite_par_id = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.alliance_membres am
        WHERE am.alliance_id = alliance_invitations.alliance_id
        AND am.compagnie_id IN (
          SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
          UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
        )
        AND am.role IN ('president', 'vice_president')
      )
    )
  );

DROP POLICY IF EXISTS "alliance_invitations_update" ON public.alliance_invitations;
CREATE POLICY "alliance_invitations_update" ON public.alliance_invitations
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR alliance_invitations.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_membres am
      WHERE am.alliance_id = alliance_invitations.alliance_id
      AND am.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND am.role IN ('president', 'vice_president')
    )
  )
  WITH CHECK (
    public.is_admin()
    OR alliance_invitations.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_membres am
      WHERE am.alliance_id = alliance_invitations.alliance_id
      AND am.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND am.role IN ('president', 'vice_president')
    )
  );

DROP POLICY IF EXISTS "alliance_membres_insert" ON public.alliance_membres;
CREATE POLICY "alliance_membres_insert" ON public.alliance_membres
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alliance_membres am2
      WHERE am2.alliance_id = alliance_membres.alliance_id
      AND am2.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND am2.role IN ('president', 'vice_president')
    )
    OR (
      alliance_membres.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.alliance_invitations inv
        WHERE inv.alliance_id = alliance_membres.alliance_id
        AND inv.compagnie_id = alliance_membres.compagnie_id
        AND inv.statut = 'acceptee'
      )
    )
  );

-- Insert client : réservé à alliance_creer (SECURITY DEFINER). JWT direct : refus.
DROP POLICY IF EXISTS "alliance_parametres_insert" ON public.alliance_parametres;
CREATE POLICY "alliance_parametres_insert" ON public.alliance_parametres
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "alliance_transferts_insert" ON public.alliance_transferts_avions;
CREATE POLICY "alliance_transferts_insert" ON public.alliance_transferts_avions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND compagnie_source_id IN (SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid())
      AND alliance_id IN (
        SELECT am.alliance_id FROM public.alliance_membres am
        WHERE am.compagnie_id = alliance_transferts_avions.compagnie_source_id
      )
    )
  );

DROP POLICY IF EXISTS "alliance_transferts_update" ON public.alliance_transferts_avions;
CREATE POLICY "alliance_transferts_update" ON public.alliance_transferts_avions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR alliance_transferts_avions.compagnie_source_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR alliance_transferts_avions.compagnie_dest_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR alliance_transferts_avions.compagnie_source_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
    OR alliance_transferts_avions.compagnie_dest_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Réparation
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "entreprises_reparation_insert" ON public.entreprises_reparation;
CREATE POLICY "entreprises_reparation_insert" ON public.entreprises_reparation
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR pdg_id = auth.uid());

DROP POLICY IF EXISTS "reparation_employes_insert" ON public.reparation_employes;
CREATE POLICY "reparation_employes_insert" ON public.reparation_employes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR reparation_employes.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_employes_delete" ON public.reparation_employes;
CREATE POLICY "reparation_employes_delete" ON public.reparation_employes
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR reparation_employes.user_id = auth.uid()
    OR reparation_employes.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_hangars_insert" ON public.reparation_hangars;
CREATE POLICY "reparation_hangars_insert" ON public.reparation_hangars
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR reparation_hangars.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_hangars_delete" ON public.reparation_hangars;
CREATE POLICY "reparation_hangars_delete" ON public.reparation_hangars
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR reparation_hangars.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_tarifs_insert" ON public.reparation_tarifs;
CREATE POLICY "reparation_tarifs_insert" ON public.reparation_tarifs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR reparation_tarifs.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
    OR reparation_tarifs.entreprise_id IN (
      SELECT re.entreprise_id FROM public.reparation_employes re
      WHERE re.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_tarifs_update" ON public.reparation_tarifs;
CREATE POLICY "reparation_tarifs_update" ON public.reparation_tarifs
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR reparation_tarifs.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
    OR reparation_tarifs.entreprise_id IN (
      SELECT re.entreprise_id FROM public.reparation_employes re
      WHERE re.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR reparation_tarifs.entreprise_id IN (
      SELECT er.id FROM public.entreprises_reparation er WHERE er.pdg_id = auth.uid()
    )
    OR reparation_tarifs.entreprise_id IN (
      SELECT re.entreprise_id FROM public.reparation_employes re
      WHERE re.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_demandes_insert" ON public.reparation_demandes;
CREATE POLICY "reparation_demandes_insert" ON public.reparation_demandes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      reparation_demandes.compagnie_id IN (
        SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
        UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.compagnie_avions ca
        WHERE ca.id = reparation_demandes.avion_id
        AND ca.compagnie_id = reparation_demandes.compagnie_id
      )
      AND EXISTS (
        SELECT 1 FROM public.reparation_hangars h
        WHERE h.id = reparation_demandes.hangar_id
        AND h.entreprise_id = reparation_demandes.entreprise_id
      )
    )
  );

DROP POLICY IF EXISTS "reparation_demandes_update" ON public.reparation_demandes;
CREATE POLICY "reparation_demandes_update" ON public.reparation_demandes
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR reparation_demandes.entreprise_id IN (
      SELECT re.entreprise_id FROM public.reparation_employes re WHERE re.user_id = auth.uid()
    )
    OR reparation_demandes.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR reparation_demandes.entreprise_id IN (
      SELECT re.entreprise_id FROM public.reparation_employes re WHERE re.user_id = auth.uid()
    )
    OR reparation_demandes.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reparation_mini_jeux_insert" ON public.reparation_mini_jeux_scores;
CREATE POLICY "reparation_mini_jeux_insert" ON public.reparation_mini_jeux_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.reparation_demandes rd
      WHERE rd.id = reparation_mini_jeux_scores.demande_id
      AND rd.entreprise_id IN (
        SELECT re.entreprise_id FROM public.reparation_employes re WHERE re.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Incidents de vol — restreindre aux rôles JWT (sans PUBLIC « true »)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "incidents_vol_insert" ON public.incidents_vol;
DROP POLICY IF EXISTS "incidents_vol_update" ON public.incidents_vol;

CREATE POLICY "incidents_vol_insert" ON public.incidents_vol
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR signale_par_id = auth.uid()
  );

CREATE POLICY "incidents_vol_update" ON public.incidents_vol
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR signale_par_id = auth.uid()
    OR incidents_vol.pilote_id = auth.uid()
    OR incidents_vol.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR incidents_vol.signale_par_id = auth.uid()
    OR incidents_vol.pilote_id = auth.uid()
    OR incidents_vol.compagnie_id IN (
      SELECT c.id FROM public.compagnies c WHERE c.pdg_id = auth.uid()
      UNION SELECT ce.compagnie_id FROM public.compagnie_employes ce WHERE ce.pilote_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5) SIAVI — intervention = propre utilisateur
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "siavi_interventions_insert" ON public.siavi_interventions;
CREATE POLICY "siavi_interventions_insert" ON public.siavi_interventions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR user_id = auth.uid());
