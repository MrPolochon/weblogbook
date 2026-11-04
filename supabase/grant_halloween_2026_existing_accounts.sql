-- Attribution ponctuelle aux comptes existants lors de la demande.
-- Réexécutable sans doublons et sans inclure les inscriptions ultérieures.
BEGIN;

CREATE TABLE IF NOT EXISTS public.account_badges (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge text NOT NULL,
  PRIMARY KEY (user_id, badge)
);
ALTER TABLE public.account_badges ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_badges TO service_role;

CREATE OR REPLACE FUNCTION public.get_badge_counts()
RETURNS TABLE (user_id uuid, total bigint)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT b.user_id, count(*) FROM public.account_badges b GROUP BY b.user_id;
$$;
REVOKE ALL ON FUNCTION public.get_badge_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_badge_counts() TO service_role;

WITH eligible AS (
  SELECT p.id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.created_at <= TIMESTAMPTZ '2026-11-04 18:20:28.798622+00'
), granted AS (
  INSERT INTO public.account_badges (user_id, badge)
  SELECT id, 'halloween-2026'
  FROM eligible
  ON CONFLICT (user_id, badge) DO NOTHING
  RETURNING user_id
)
SELECT (SELECT count(*) FROM eligible) AS comptes_concernes,
       count(*) AS nouveaux_badges
FROM granted;

COMMIT;
