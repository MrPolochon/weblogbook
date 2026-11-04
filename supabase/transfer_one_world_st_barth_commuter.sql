-- À exécuter dans l'éditeur SQL Supabase avec le compte administrateur.
-- Transfère la présidence de One World à St Barth Commuter.
-- L'ancien président devient vice-président, comme dans l'application.
BEGIN;
DO $$
DECLARE
  v_alliance uuid;
  v_compagnie uuid;
  v_membre uuid;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.alliances
    WHERE regexp_replace(lower(nom), '[^a-z0-9]', '', 'g') = 'oneworld';
  IF v_count <> 1 THEN RAISE EXCEPTION 'One World : % alliances trouvées, transfert annulé', v_count; END IF;
  SELECT id INTO v_alliance FROM public.alliances
    WHERE regexp_replace(lower(nom), '[^a-z0-9]', '', 'g') = 'oneworld' FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.compagnies
    WHERE regexp_replace(lower(nom), '[^a-z0-9]', '', 'g') = 'stbarthcommuter';
  IF v_count <> 1 THEN RAISE EXCEPTION 'St Barth Commuter : % compagnies trouvées, transfert annulé', v_count; END IF;
  SELECT id INTO v_compagnie FROM public.compagnies
    WHERE regexp_replace(lower(nom), '[^a-z0-9]', '', 'g') = 'stbarthcommuter' FOR UPDATE;
  PERFORM id FROM public.alliance_membres WHERE alliance_id = v_alliance ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.alliance_membres
    WHERE alliance_id = v_alliance AND compagnie_id = v_compagnie;
  IF v_count <> 1 THEN RAISE EXCEPTION 'St Barth Commuter doit avoir une adhésion unique à One World'; END IF;
  SELECT id INTO v_membre FROM public.alliance_membres
    WHERE alliance_id = v_alliance AND compagnie_id = v_compagnie;
  UPDATE public.alliance_membres SET role = 'vice_president'
    WHERE alliance_id = v_alliance AND role = 'president' AND id <> v_membre;
  UPDATE public.alliance_membres SET role = 'president' WHERE id = v_membre;
END $$;
COMMIT;

-- Vérification du résultat.
SELECT a.nom AS alliance, c.nom AS compagnie, m.role
FROM public.alliance_membres m
JOIN public.alliances a ON a.id = m.alliance_id
JOIN public.compagnies c ON c.id = m.compagnie_id
WHERE regexp_replace(lower(a.nom), '[^a-z0-9]', '', 'g') = 'oneworld'
ORDER BY m.role, c.nom;
