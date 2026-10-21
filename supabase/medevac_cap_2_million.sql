-- Increase the fixed-wing MEDEVAC mission cap; preserve helicopter rates and crew split.
CREATE OR REPLACE FUNCTION public.medevac_mission_revenue(p_minutes numeric, p_helicopter boolean)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public,pg_temp AS $$
 SELECT CASE WHEN p_helicopter THEN least(800000,100000+3000*least(greatest(coalesce(p_minutes,0),0),60)+2000*greatest(coalesce(p_minutes,0)-60,0))
 ELSE least(2000000,150000+5000*greatest(coalesce(p_minutes,0),0)) END::bigint;
$$;
