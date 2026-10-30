-- Avis de voyageurs fictifs : une publication par vol réglé, sans saisie client.
CREATE TABLE IF NOT EXISTS public.flight_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.plans_vol(id),
  company_id uuid NOT NULL REFERENCES public.compagnies(id),
  author_label text NOT NULL DEFAULT 'Voyageur virtuel',
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1500),
  sentiment text NOT NULL CHECK (sentiment IN ('positif','mitige','negatif')),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  demand_percent numeric NOT NULL CHECK (demand_percent BETWEEN -2 AND 0.25),
  simulation boolean NOT NULL DEFAULT true CHECK (simulation),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);
CREATE INDEX IF NOT EXISTS flight_reviews_feed_idx ON public.flight_reviews(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS flight_reviews_reputation_idx ON public.flight_reviews(company_id,expires_at);
ALTER TABLE public.flight_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flight_reviews FROM anon,authenticated;
GRANT SELECT(id,author_label,body,sentiment,rating,simulation,created_at) ON public.flight_reviews TO anon,authenticated;
GRANT ALL ON public.flight_reviews TO service_role;
DROP POLICY IF EXISTS flight_reviews_public_read ON public.flight_reviews;
CREATE POLICY flight_reviews_public_read ON public.flight_reviews FOR SELECT TO anon,authenticated USING (true);

CREATE OR REPLACE FUNCTION public.flight_review_reputation(p_company uuid,p_at timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT greatest(-8,least(3,coalesce(sum(demand_percent *
    (extract(epoch FROM (expires_at-p_at))/nullif(extract(epoch FROM (expires_at-created_at)),0))),0)))
  FROM public.flight_reviews WHERE company_id=p_company AND created_at<=p_at AND expires_at>p_at;
$$;
REVOKE ALL ON FUNCTION public.flight_review_reputation(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flight_review_reputation(uuid,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_flight_review(p_plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; d jsonb; delay numeric; tone text; stars smallint; impact numeric;
  message text; name text; completed timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.economy_release_settings WHERE id AND enabled) THEN RETURN; END IF;
  SELECT * INTO p FROM public.plans_vol WHERE id=p_plan;
  IF NOT FOUND OR NOT p.vol_commercial OR p.compagnie_id IS NULL OR p.statut::text<>'cloture' THEN RETURN; END IF;
  SELECT detail INTO d FROM public.flight_economy_settlements WHERE plan_id=p_plan;
  IF d IS NULL THEN RETURN; END IF;
  SELECT nom INTO name FROM public.compagnies WHERE id=p.compagnie_id;
  delay:=greatest(0,least(1440,coalesce((d->>'delay_minutes')::numeric,0)));
  completed:=coalesce(p.cloture_at,now());
  IF delay<=5 THEN
    tone:='positif'; stars:=5; impact:=0.25;
    message:=CASE mod(abs(hashtext(p_plan::text)::bigint),3)
      WHEN 0 THEN format('Un voyage bien organisé avec %s : nous sommes arrivés dans la marge de ponctualité prévue. Une bonne expérience !',name)
      WHEN 1 THEN format('J’ai apprécié mon vol avec %s. L’arrivée était à l’heure, ça fait plaisir.',name)
      ELSE format('Bonne expérience avec %s aujourd’hui, le vol est resté ponctuel. Je reprendrais volontiers cette compagnie.',name) END;
  ELSIF delay<=15 THEN
    tone:='mitige'; stars:=3; impact:=0;
    message:=format('Mon vol avec %s est arrivé avec %s minutes de retard. Un petit décalage, j’espère une arrivée plus ponctuelle la prochaine fois.',name,round(delay));
  ELSIF delay<=30 THEN
    tone:='negatif'; stars:=2; impact:=-0.5;
    message:=format('Une attente décevante avec %s : %s minutes de retard à l’arrivée. Ce n’était pas l’expérience que j’espérais.',name,round(delay));
  ELSIF delay<=60 THEN
    tone:='negatif'; stars:=2; impact:=-1;
    message:=format('Le retard de %s minutes sur mon vol avec %s a vraiment pesé sur mon voyage. La ponctualité doit s’améliorer.',round(delay),name);
  ELSE
    tone:='negatif'; stars:=1; impact:=-2;
    message:=format('Très déçu de mon arrivée avec %s : %s minutes de retard. Une attente beaucoup trop longue pour ce trajet.',name,round(delay));
  END IF;
  IF coalesce((d->>'diverted')::boolean,false) THEN
    message:=message || format(' Nous avons finalement atterri à %s après un déroutement.',p.aeroport_arrivee);
  END IF;
  IF coalesce((d->>'wifi_enabled')::boolean,false) THEN
    message:=message || CASE WHEN coalesce((d->>'wifi_price')::numeric,0)=0 THEN ' Le Wi-Fi gratuit à bord est un plus.' ELSE ' Le Wi-Fi était proposé à bord.' END;
  END IF;
  IF coalesce((d->>'ife_level')::numeric,0)>0 THEN message:=message || ' Des divertissements étaient également proposés à bord.'; END IF;
  INSERT INTO public.flight_reviews(plan_id,company_id,body,sentiment,rating,demand_percent,created_at,expires_at)
    VALUES(p.id,p.compagnie_id,message,tone,stars,impact,completed,completed+interval '14 days')
    ON CONFLICT(plan_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_flight_review(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_flight_review(uuid) TO service_role;
