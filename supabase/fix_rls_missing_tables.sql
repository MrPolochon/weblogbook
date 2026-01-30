-- Migration: Activer RLS sur les tables qui en manquent
-- Date: 2026-01-29

-- =====================================================
-- 1. atc_calls - Appels entre ATC
-- =====================================================
ALTER TABLE public.atc_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atc_calls_select" ON public.atc_calls
  FOR SELECT USING (
    from_user_id = auth.uid() 
    OR to_user_id = auth.uid() 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "atc_calls_insert" ON public.atc_calls
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "atc_calls_delete" ON public.atc_calls
  FOR DELETE USING (
    from_user_id = auth.uid() 
    OR to_user_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 2. compagnie_invitations - Invitations de recrutement
-- =====================================================
ALTER TABLE public.compagnie_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compagnie_invitations_select" ON public.compagnie_invitations
  FOR SELECT USING (
    pilote_id = auth.uid()
    OR compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'ifsa')
  );

CREATE POLICY "compagnie_invitations_insert" ON public.compagnie_invitations
  FOR INSERT WITH CHECK (
    compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "compagnie_invitations_update" ON public.compagnie_invitations
  FOR UPDATE USING (
    pilote_id = auth.uid()
    OR compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "compagnie_invitations_delete" ON public.compagnie_invitations
  FOR DELETE USING (
    compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 3. ifsa_enquetes - Enquêtes IFSA
-- =====================================================
ALTER TABLE public.ifsa_enquetes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifsa_enquetes_select" ON public.ifsa_enquetes
  FOR SELECT USING (
    pilote_concerne_id = auth.uid()
    OR enqueteur_id = auth.uid()
    OR ouvert_par_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_enquetes_insert" ON public.ifsa_enquetes
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_enquetes_update" ON public.ifsa_enquetes
  FOR UPDATE USING (
    enqueteur_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_enquetes_delete" ON public.ifsa_enquetes
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 4. ifsa_enquetes_notes - Notes d'enquêtes IFSA
-- =====================================================
ALTER TABLE public.ifsa_enquetes_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifsa_enquetes_notes_select" ON public.ifsa_enquetes_notes
  FOR SELECT USING (
    auteur_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_enquetes_notes_insert" ON public.ifsa_enquetes_notes
  FOR INSERT WITH CHECK (
    auteur_id = auth.uid()
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
      OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

CREATE POLICY "ifsa_enquetes_notes_delete" ON public.ifsa_enquetes_notes
  FOR DELETE USING (
    auteur_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 5. ifsa_paiements_amendes - Paiements d'amendes IFSA
-- =====================================================
ALTER TABLE public.ifsa_paiements_amendes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifsa_paiements_amendes_select" ON public.ifsa_paiements_amendes
  FOR SELECT USING (
    paye_par_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_paiements_amendes_insert" ON public.ifsa_paiements_amendes
  FOR INSERT WITH CHECK (
    paye_par_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 6. ifsa_sanctions - Sanctions IFSA
-- =====================================================
ALTER TABLE public.ifsa_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifsa_sanctions_select" ON public.ifsa_sanctions
  FOR SELECT USING (
    cible_pilote_id = auth.uid()
    OR emis_par_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_sanctions_insert" ON public.ifsa_sanctions
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_sanctions_update" ON public.ifsa_sanctions
  FOR UPDATE USING (
    emis_par_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_sanctions_delete" ON public.ifsa_sanctions
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 7. ifsa_signalements - Signalements IFSA
-- =====================================================
ALTER TABLE public.ifsa_signalements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifsa_signalements_select" ON public.ifsa_signalements
  FOR SELECT USING (
    signale_par_id = auth.uid()
    OR pilote_signale_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_signalements_insert" ON public.ifsa_signalements
  FOR INSERT WITH CHECK (
    signale_par_id = auth.uid()
  );

CREATE POLICY "ifsa_signalements_update" ON public.ifsa_signalements
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT ifsa FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "ifsa_signalements_delete" ON public.ifsa_signalements
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 8. vols_archive - Archives des vols supprimés
-- =====================================================
ALTER TABLE public.vols_archive ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent voir les archives
CREATE POLICY "vols_archive_admin_only" ON public.vols_archive
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- 9. vols_equipage_militaire - Équipage militaire
-- =====================================================
ALTER TABLE public.vols_equipage_militaire ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vols_equipage_militaire_select" ON public.vols_equipage_militaire
  FOR SELECT USING (
    profile_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT armee FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "vols_equipage_militaire_insert" ON public.vols_equipage_militaire
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (SELECT armee FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "vols_equipage_militaire_delete" ON public.vols_equipage_militaire
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- =====================================================
-- FIN DE LA MIGRATION
-- =====================================================
