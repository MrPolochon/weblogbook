-- Enregistrement côté serveur des comptes ayant validé l’écran du 1er avril (poisson d’avril).
-- À exécuter dans l’éditeur SQL Supabase si la table n’existe pas encore.

CREATE TABLE IF NOT EXISTS public.april_fool_ack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  ack_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_april_fool_ack_year ON public.april_fool_ack(year);
CREATE INDEX IF NOT EXISTS idx_april_fool_ack_year_ack_at ON public.april_fool_ack(year, ack_at);

ALTER TABLE public.april_fool_ack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.april_fool_ack FORCE ROW LEVEL SECURITY;

-- Évite l’exposition via la clé anon (API PostgREST) : lecture palmarès = route serveur (service_role) uniquement.
REVOKE ALL ON TABLE public.april_fool_ack FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.april_fool_ack TO authenticated;

DROP POLICY IF EXISTS "april_fool_ack_insert_own" ON public.april_fool_ack;
CREATE POLICY "april_fool_ack_insert_own" ON public.april_fool_ack
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "april_fool_ack_select_authenticated" ON public.april_fool_ack;
CREATE POLICY "april_fool_ack_select_own" ON public.april_fool_ack
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Upsert = UPDATE en cas de conflit
DROP POLICY IF EXISTS "april_fool_ack_update_own" ON public.april_fool_ack;
CREATE POLICY "april_fool_ack_update_own" ON public.april_fool_ack
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.april_fool_ack IS 'Accusé de réception poisson d’avril par utilisateur et par année (Europe/Paris).';

-- Exemple : tous les identifiants profil ayant validé la blague pour une année
-- SELECT p.identifiant, a.ack_at
-- FROM public.april_fool_ack a
-- JOIN public.profiles p ON p.id = a.user_id
-- WHERE a.year = 2026
-- ORDER BY a.ack_at;
