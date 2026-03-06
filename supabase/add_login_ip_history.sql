-- Historique des changements d'IP à chaque enregistrement ou modification de last_login_ip
-- (après validation du code email). Permet de lister date/heure, IP, IP précédente, type d'appareil.

CREATE TABLE IF NOT EXISTS public.login_ip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  previous_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_ip_history_user_id ON public.login_ip_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_ip_history_created_at ON public.login_ip_history(created_at DESC);

COMMENT ON TABLE public.login_ip_history IS 'Historique des IP enregistrées à chaque validation du code de connexion (changement ou première IP)';
COMMENT ON COLUMN public.login_ip_history.previous_ip IS 'IP précédemment enregistrée (null si première connexion avec code)';
COMMENT ON COLUMN public.login_ip_history.user_agent IS 'En-tête User-Agent de la requête (navigateur / type d''appareil)';

-- RLS : pas d'accès via anon ; lecture possible par service role (requêtes SQL manuelles)
ALTER TABLE public.login_ip_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_ip_history_no_anon"
  ON public.login_ip_history
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
