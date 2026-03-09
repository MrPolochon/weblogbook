-- =====================================================
-- Code de vérification pour réinitialisation MDP par admin
-- =====================================================
-- Quand un admin réinitialise le mot de passe d'un compte,
-- un code est envoyé à l'email du compte ; l'admin doit
-- saisir ce code pour confirmer.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_password_reset_codes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.admin_password_reset_codes IS 'Codes à 6 chiffres envoyés par email quand un admin réinitialise un mot de passe ; vérifiés avant application.';

ALTER TABLE public.admin_password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Aucun accès via RLS : la table est utilisée uniquement par le backend (service_role)
DROP POLICY IF EXISTS "admin_password_reset_codes_no_anon" ON public.admin_password_reset_codes;
CREATE POLICY "admin_password_reset_codes_no_anon" ON public.admin_password_reset_codes
  FOR ALL USING (false);

DROP POLICY IF EXISTS "admin_password_reset_codes_no_authenticated" ON public.admin_password_reset_codes;
CREATE POLICY "admin_password_reset_codes_no_authenticated" ON public.admin_password_reset_codes
  FOR ALL TO authenticated USING (false);
