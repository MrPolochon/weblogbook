-- ============================================================
-- Configuration globale du site (options admin)
-- ============================================================

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

-- Lecture : tout authentifié (pour le middleware)
DROP POLICY IF EXISTS "site_config_select" ON public.site_config;
CREATE POLICY "site_config_select" ON public.site_config
  FOR SELECT TO authenticated USING (true);

-- Mise à jour : admin uniquement (via API avec service_role ou policy)
DROP POLICY IF EXISTS "site_config_update_admin" ON public.site_config;
CREATE POLICY "site_config_update_admin" ON public.site_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_site_config_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_config_updated_at ON public.site_config;
CREATE TRIGGER site_config_updated_at BEFORE UPDATE ON public.site_config
  FOR EACH ROW EXECUTE FUNCTION public.set_site_config_updated_at();
