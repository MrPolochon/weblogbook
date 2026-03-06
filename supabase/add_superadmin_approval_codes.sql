-- ============================================================
-- Approbation à deux avec codes croisés (consultation IP)
-- Crée les tables de base si elles n'existent pas (sinon exécuter add_superadmin_ip_access.sql avant).
-- ============================================================

-- Tables de base (si pas déjà exécuté add_superadmin_ip_access.sql)
CREATE TABLE IF NOT EXISTS public.superadmin_access_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.superadmin_ip_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_requested_by ON public.superadmin_ip_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_status ON public.superadmin_ip_requests(status);
CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_created_at ON public.superadmin_ip_requests(created_at DESC);

ALTER TABLE public.superadmin_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superadmin_ip_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "superadmin_codes_no_anon" ON public.superadmin_access_codes;
CREATE POLICY "superadmin_codes_no_anon" ON public.superadmin_access_codes FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "superadmin_requests_no_anon" ON public.superadmin_ip_requests;
CREATE POLICY "superadmin_requests_no_anon" ON public.superadmin_ip_requests FOR ALL TO anon USING (false) WITH CHECK (false);

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
