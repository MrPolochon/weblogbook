-- ============================================================
-- MIGRATIONS SÉCURITÉ - TOUT EN UN (exécution unique)
-- Copie temporaire des 4 migrations : IP, email vérif, pending_email, site_config
-- À exécuter une seule fois dans Supabase SQL Editor, puis supprimer ce fichier si besoin.
-- ============================================================

-- ========== 1. add_login_ip_security ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_login_ip IS 'Dernière adresse IP enregistrée à la connexion';
COMMENT ON COLUMN public.profiles.last_login_at IS 'Date/heure de la dernière connexion';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type_message IN (
    'normal',
    'cheque_salaire',
    'cheque_revenu_compagnie',
    'cheque_taxes_atc',
    'recrutement',
    'sanction_ifsa',
    'amende_ifsa',
    'relance_amende',
    'location_avion',
    'cheque_siavi_intervention',
    'cheque_siavi_taxes',
    'systeme',
    'alerte_connexion'
  ));

-- ========== 2. add_login_email_verification ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.profiles.email IS 'Adresse email pour envoi du code de vérification à chaque connexion';

CREATE TABLE IF NOT EXISTS public.login_verification_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_verification_codes IS 'Code à 6 chiffres envoyé par email pour confirmer chaque connexion';

ALTER TABLE public.login_verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_codes_service_only" ON public.login_verification_codes;
CREATE POLICY "login_codes_service_only" ON public.login_verification_codes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ========== 3. add_login_pending_email ==========
ALTER TABLE public.login_verification_codes
  ADD COLUMN IF NOT EXISTS pending_email TEXT;

COMMENT ON COLUMN public.login_verification_codes.pending_email IS 'Email saisi par l''utilisateur (sans profil email) ; enregistré dans profiles après validation du code';

-- ========== 4. add_site_config ==========
CREATE TABLE IF NOT EXISTS public.site_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  login_admin_only BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.site_config.login_admin_only IS 'Si true, seuls les comptes admin peuvent se connecter (réglable dans Admin > Sécurité)';

INSERT INTO public.site_config (id, login_admin_only)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_config_select" ON public.site_config;
CREATE POLICY "site_config_select" ON public.site_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "site_config_update_admin" ON public.site_config;
CREATE POLICY "site_config_update_admin" ON public.site_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_site_config_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_config_updated_at ON public.site_config;
CREATE TRIGGER site_config_updated_at BEFORE UPDATE ON public.site_config
  FOR EACH ROW EXECUTE FUNCTION public.set_site_config_updated_at();
