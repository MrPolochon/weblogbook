-- ============================================================
-- Protection anti-vol des IP : stockage dans une table dédiée
-- accessible UNIQUEMENT via service_role (pas de lecture par les comptes authentifiés).
-- ============================================================

-- 1. Table dédiée pour les IP (RLS = aucun accès anon/authenticated)
CREATE TABLE IF NOT EXISTS public.user_login_tracking (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_login_ip TEXT,
  last_login_at TIMESTAMPTZ
);

COMMENT ON TABLE public.user_login_tracking IS 'Dernière IP et date de connexion par compte. Réservé au backend (service_role). Non accessible aux utilisateurs authentifiés.';

ALTER TABLE public.user_login_tracking ENABLE ROW LEVEL SECURITY;

-- Seul le backend (service_role) peut accéder. Anon et authenticated refusés explicitement.
DROP POLICY IF EXISTS "user_login_tracking_no_anon" ON public.user_login_tracking;
CREATE POLICY "user_login_tracking_no_anon" ON public.user_login_tracking
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "user_login_tracking_no_authenticated" ON public.user_login_tracking;
CREATE POLICY "user_login_tracking_no_authenticated" ON public.user_login_tracking
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 2. Copier les données existantes depuis profiles (si les colonnes existent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_login_ip'
  ) THEN
    INSERT INTO public.user_login_tracking (user_id, last_login_ip, last_login_at)
    SELECT id, last_login_ip, last_login_at FROM public.profiles
    WHERE last_login_ip IS NOT NULL OR last_login_at IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET
      last_login_ip = EXCLUDED.last_login_ip,
      last_login_at = EXCLUDED.last_login_at;
  END IF;
END $$;

-- 3. Retirer les colonnes IP de profiles (elles ne sont plus lisibles par quiconque peut lire profiles)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_login_ip;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_login_at;
