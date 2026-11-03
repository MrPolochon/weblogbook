CREATE OR REPLACE FUNCTION public.get_classement_recherches()
RETURNS TABLE (nom text, recherches bigint)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT c.nom::text, count(*)
  FROM public.company_research_projects p
  JOIN public.compagnies c ON c.id = p.company_id
  WHERE p.ready_at <= now()
  GROUP BY c.id, c.nom
  ORDER BY count(*) DESC, c.nom, c.id;
$$;

REVOKE ALL ON FUNCTION public.get_classement_recherches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_classement_recherches() TO service_role;
