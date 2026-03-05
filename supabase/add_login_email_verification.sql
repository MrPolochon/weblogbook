-- ============================================================
-- Vérification par email à chaque connexion : email obligatoire + code à 6 chiffres
-- ============================================================

-- 1. Email de contact (obligatoire pour recevoir le code de connexion)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.profiles.email IS 'Adresse email pour envoi du code de vérification à chaque connexion';

-- 2. Codes de vérification de connexion (un par utilisateur, écrasé à chaque envoi)
CREATE TABLE IF NOT EXISTS public.login_verification_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_verification_codes IS 'Code à 6 chiffres envoyé par email pour confirmer chaque connexion';

ALTER TABLE public.login_verification_codes ENABLE ROW LEVEL SECURITY;

-- Seul le service (admin client) écrit ; les utilisateurs ne lisent pas les codes
CREATE POLICY "login_codes_service_only" ON public.login_verification_codes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Permettre au service_role (createAdminClient) d'insérer/supprimer/lire
-- (pas de policy = refus par défaut pour authenticated ; service_role bypass RLS)
-- Donc on a besoin que les API utilisent createAdminClient() pour cette table.
