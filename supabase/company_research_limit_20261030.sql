-- Les projets déjà financés restent acquis, même si plus de trois sont en cours.
-- Seuls les nouveaux projets doivent attendre qu'une place se libère.
CREATE OR REPLACE FUNCTION public.company_development_guard_research_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.ready_at > now() THEN
    -- Le même verrou protège les financements et les insertions serveur directes.
    PERFORM 1 FROM public.compagnies WHERE id=NEW.company_id FOR UPDATE;
    IF (SELECT count(*) FROM public.company_research_projects
        WHERE company_id=NEW.company_id AND ready_at>now()) >= 3 THEN
      RAISE EXCEPTION 'Trois recherches sont déjà en cours. Attendez la fin d’un projet avant d’en financer un autre.'
        USING ERRCODE='23514', CONSTRAINT='company_research_concurrency_limit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_research_concurrency_limit ON public.company_research_projects;
CREATE TRIGGER company_research_concurrency_limit
  BEFORE INSERT ON public.company_research_projects
  FOR EACH ROW EXECUTE FUNCTION public.company_development_guard_research_limit();

REVOKE ALL ON FUNCTION public.company_development_guard_research_limit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.company_development_guard_research_limit() TO service_role;
