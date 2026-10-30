CREATE TABLE IF NOT EXISTS public.company_development_catalog_manifest (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  seed_sha256 text NOT NULL CHECK(seed_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.economy_release_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.profiles(id),
  enabled boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_development_catalog_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_release_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_development_catalog_manifest,public.economy_release_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.company_development_catalog_manifest,public.economy_release_audit TO service_role;

CREATE OR REPLACE FUNCTION public.economy_release_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE catalogs boolean; routines boolean; protected boolean;
BEGIN
  catalogs:=(SELECT count(*)=360 FROM company_research_catalog) AND
    (SELECT count(*)=900 FROM company_rse_catalog) AND (SELECT count(*)=2000 FROM company_event_catalog) AND
    EXISTS(SELECT 1 FROM company_development_catalog_manifest WHERE id);
  routines:=to_regprocedure('public.settle_flight_economy(uuid)') IS NOT NULL AND
    to_regprocedure('public.company_development_effects_for_flight(uuid,uuid,timestamp with time zone,text,text,text)') IS NOT NULL AND
    to_regprocedure('public.publish_flight_review(uuid)') IS NOT NULL AND
    to_regprocedure('public.start_company_maintenance(uuid,uuid)') IS NOT NULL;
  protected:=NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname IN ('company_research_catalog','company_rse_catalog','company_event_catalog','company_development_secrets','company_rse_commitments','flight_economy_settlements','economy_release_settings') AND NOT c.relrowsecurity);
  RETURN jsonb_build_object('ready',catalogs AND routines AND protected,'catalogues',catalogs,'reglement',routines,'protection',protected);
END;
$$;
CREATE OR REPLACE FUNCTION public.set_economy_release(p_actor uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE readiness jsonb; previous boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') THEN
    RAISE EXCEPTION 'Activation réservée aux administrateurs.' USING ERRCODE='42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'État d’activation invalide.' USING ERRCODE='22023'; END IF;
  SELECT enabled INTO previous FROM public.economy_release_settings WHERE id FOR UPDATE;
  IF p_enabled THEN
    readiness:=public.economy_release_readiness();
    IF NOT coalesce((readiness->>'ready')::boolean,false) THEN RAISE EXCEPTION 'Installation incomplète : activation refusée.' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE public.economy_release_settings SET enabled=p_enabled,
    activated_at=CASE WHEN p_enabled THEN coalesce(activated_at,now()) ELSE activated_at END WHERE id;
  IF previous IS DISTINCT FROM p_enabled THEN INSERT INTO public.economy_release_audit(actor_id,enabled) VALUES(p_actor,p_enabled); END IF;
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.economy_release_readiness(),public.set_economy_release(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.economy_release_readiness(),public.set_economy_release(uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
