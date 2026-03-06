-- ============================================================
-- Approbation à deux avec codes croisés (consultation IP)
-- ============================================================

-- 1. Colonnes sur superadmin_ip_requests pour les codes croisés
ALTER TABLE public.superadmin_ip_requests
  ADD COLUMN IF NOT EXISTS code_requester TEXT,
  ADD COLUMN IF NOT EXISTS code_approver TEXT,
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_validated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approver_validated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.superadmin_ip_requests.code_requester IS 'Code affiché chez l''admin qui demande ; l''approbateur doit le saisir';
COMMENT ON COLUMN public.superadmin_ip_requests.code_approver IS 'Code affiché chez l''approbateur ; le demandeur doit le saisir';
COMMENT ON COLUMN public.superadmin_ip_requests.approver_id IS 'Admin qui participe à l''approbation (premier à ouvrir la demande)';

-- 2. Table pour forcer la déconnexion (code incorrect → les deux admins déconnectés)
CREATE TABLE IF NOT EXISTS public.security_logout (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.security_logout IS 'Utilisateurs à déconnecter immédiatement (ex: code approbation IP incorrect)';

ALTER TABLE public.security_logout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_logout_no_anon" ON public.security_logout;
CREATE POLICY "security_logout_no_anon" ON public.security_logout FOR ALL TO anon USING (false) WITH CHECK (false);
