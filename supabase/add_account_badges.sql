CREATE TABLE IF NOT EXISTS public.account_badges (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge text NOT NULL,
  PRIMARY KEY (user_id, badge)
);
ALTER TABLE public.account_badges ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_badges TO service_role;

INSERT INTO public.account_badges (user_id, badge)
SELECT DISTINCT p.id, 'halloween-2026'
FROM auth.audit_log_entries a
JOIN public.profiles p ON p.id::text = a.payload->>'actor_id'
WHERE a.payload->>'action' = 'login'
  AND a.created_at >= '2026-10-31T00:00:00Z'
  AND a.created_at < '2026-11-01T00:00:00Z'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_badge_counts()
RETURNS TABLE (user_id uuid, total bigint)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT user_id, count(*) FROM public.account_badges GROUP BY user_id;
$$;
REVOKE ALL ON FUNCTION public.get_badge_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_badge_counts() TO service_role;
