-- Passkeys WebAuthn + suivi de la dernière vérification email (reconnexion mensuelle obligatoire)

-- 1. Dernière vérification email complète (OTP) par compte
ALTER TABLE public.user_login_tracking
  ADD COLUMN IF NOT EXISTS last_email_verification_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_login_tracking.last_email_verification_at IS
  'Date de la dernière vérification par code email. Reconnexion mensuelle obligatoire par email si > 30 jours.';

-- 2. Passkeys enregistrées (clés publiques uniquement)
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);

COMMENT ON TABLE public.user_passkeys IS
  'Clés publiques WebAuthn (Face ID, Touch ID, Windows Hello). Aucune donnée biométrique brute.';

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_passkeys_no_anon" ON public.user_passkeys;
CREATE POLICY "user_passkeys_no_anon" ON public.user_passkeys
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "user_passkeys_no_authenticated" ON public.user_passkeys;
CREATE POLICY "user_passkeys_no_authenticated" ON public.user_passkeys
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 3. Challenges WebAuthn éphémères (backend service_role uniquement)
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_type ON public.webauthn_challenges(user_id, type);

COMMENT ON TABLE public.webauthn_challenges IS
  'Challenges WebAuthn temporaires pour inscription ou authentification.';

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webauthn_challenges_no_anon" ON public.webauthn_challenges;
CREATE POLICY "webauthn_challenges_no_anon" ON public.webauthn_challenges
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "webauthn_challenges_no_authenticated" ON public.webauthn_challenges;
CREATE POLICY "webauthn_challenges_no_authenticated" ON public.webauthn_challenges
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
