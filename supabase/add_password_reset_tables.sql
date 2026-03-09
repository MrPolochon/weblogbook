-- =====================================================
-- Mot de passe oublié : tokens (lien de réinitialisation)
-- et demandes admin
-- =====================================================

-- Token pour le lien "réinitialiser mon mot de passe" (self-service)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.password_reset_tokens IS 'Tokens pour le lien de réinitialisation de mot de passe (mot de passe oublié).';

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_reset_tokens_no_access" ON public.password_reset_tokens;
CREATE POLICY "password_reset_tokens_no_access" ON public.password_reset_tokens FOR ALL USING (false);

-- Demandes de réinitialisation adressées aux administrateurs
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant_or_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.password_reset_requests IS 'Demandes de réinitialisation de mot de passe adressées aux administrateurs (quand l''utilisateur n''a pas d''email ou choisit cette option).';

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_reset_requests_no_anon" ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_no_anon" ON public.password_reset_requests FOR ALL USING (false);
DROP POLICY IF EXISTS "password_reset_requests_admin_only" ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_admin_only" ON public.password_reset_requests
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
