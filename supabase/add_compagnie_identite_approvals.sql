-- Identité radio : demande préalable, décision atomique et historique IFSA.
-- Exécuter avant de déployer les routes et interfaces correspondantes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.compagnie_identite_demandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  demandeur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ancien_code_oaci text,
  ancienne_telephonie text,
  nouveau_code_oaci text NOT NULL CHECK (nouveau_code_oaci ~ '^[A-Z]{3}$'),
  nouvelle_telephonie text NOT NULL CHECK (nouvelle_telephonie ~ '^[A-Z]+( [A-Z]+)?$' AND length(nouvelle_telephonie) <= 30),
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuvee','refusee')),
  motif_reponse text,
  traite_par_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  traite_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS compagnie_identite_une_attente
  ON public.compagnie_identite_demandes(compagnie_id) WHERE statut = 'en_attente';
ALTER TABLE public.compagnie_identite_demandes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compagnie_identite_demandes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.compagnie_identite_demandes TO service_role;

CREATE OR REPLACE FUNCTION public.demander_identite_compagnie(
  p_compagnie_id uuid, p_acteur_id uuid, p_code text, p_telephonie text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.compagnies%ROWTYPE; d public.compagnie_identite_demandes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM compagnies WHERE id = p_compagnie_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compagnie introuvable'; END IF;
  IF NOT (coalesce(c.pdg_id = p_acteur_id,false)
    OR EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=c.id AND pilote_id=p_acteur_id AND role='co_pdg')
    OR EXISTS(SELECT 1 FROM profiles WHERE id=p_acteur_id AND role='admin')) THEN
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE='42501';
  END IF;
  p_code := upper(trim(p_code));
  p_telephonie := regexp_replace(upper(trim(p_telephonie)), '\s+', ' ', 'g');
  IF p_code IS NULL OR p_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Le code OACI doit contenir exactement trois lettres'; END IF;
  IF p_telephonie IS NULL OR p_telephonie !~ '^[A-Z]+( [A-Z]+)?$' OR length(p_telephonie)>30 THEN
    RAISE EXCEPTION 'La radiophonie doit contenir un ou deux mots, sans chiffres, au maximum 30 caractères';
  END IF;
  IF c.code_oaci IS NOT DISTINCT FROM p_code AND c.callsign_telephonie IS NOT DISTINCT FROM p_telephonie THEN
    RETURN jsonb_build_object('inchangee',true);
  END IF;
  SELECT * INTO d FROM compagnie_identite_demandes WHERE compagnie_id=c.id AND statut='en_attente';
  IF FOUND THEN
    IF d.nouveau_code_oaci=p_code AND d.nouvelle_telephonie=p_telephonie THEN RETURN to_jsonb(d); END IF;
    RAISE EXCEPTION 'Une demande est déjà en attente de validation IFSA pour cette compagnie';
  END IF;
  INSERT INTO compagnie_identite_demandes(compagnie_id,demandeur_id,ancien_code_oaci,ancienne_telephonie,nouveau_code_oaci,nouvelle_telephonie)
  VALUES(c.id,p_acteur_id,c.code_oaci,c.callsign_telephonie,p_code,p_telephonie) RETURNING * INTO d;
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.decider_identite_compagnie(
  p_demande_id uuid, p_acteur_id uuid, p_action text, p_motif text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.compagnies%ROWTYPE; d public.compagnie_identite_demandes%ROWTYPE; cid uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_acteur_id AND (ifsa IS TRUE OR role='admin')) THEN
    RAISE EXCEPTION 'Réservé à l’IFSA' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('approuver','refuser') OR p_action IS NULL THEN RAISE EXCEPTION 'Action invalide'; END IF;
  IF nullif(trim(p_motif),'') IS NULL THEN RAISE EXCEPTION 'Un motif de décision est requis'; END IF;
  SELECT compagnie_id INTO cid FROM compagnie_identite_demandes WHERE id=p_demande_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  -- Même ordre de verrouillage que la soumission, puis sérialisation des attributions.
  SELECT * INTO c FROM compagnies WHERE id=cid FOR UPDATE;
  SELECT * INTO d FROM compagnie_identite_demandes WHERE id=p_demande_id FOR UPDATE;
  IF d.statut <> 'en_attente' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;
  IF p_action='approuver' THEN
    PERFORM pg_advisory_xact_lock(20261026,53);
    IF c.code_oaci IS DISTINCT FROM d.ancien_code_oaci OR c.callsign_telephonie IS DISTINCT FROM d.ancienne_telephonie THEN
      RAISE EXCEPTION 'L’identité actuelle a changé : refuser cette demande et en déposer une nouvelle';
    END IF;
    IF EXISTS(SELECT 1 FROM compagnies WHERE id<>c.id AND
      (upper(trim(code_oaci))=d.nouveau_code_oaci OR upper(trim(callsign_telephonie))=d.nouvelle_telephonie)) THEN
      RAISE EXCEPTION 'Ce code OACI ou cette radiophonie est déjà utilisé par une autre compagnie';
    END IF;
  END IF;
  UPDATE compagnie_identite_demandes SET statut=CASE WHEN p_action='approuver' THEN 'approuvee' ELSE 'refusee' END,
    motif_reponse=trim(p_motif),traite_par_id=p_acteur_id,traite_at=now() WHERE id=d.id RETURNING * INTO d;
  IF p_action='approuver' THEN
    PERFORM set_config('app.identite_demande_id',d.id::text,true);
    UPDATE compagnies SET code_oaci=d.nouveau_code_oaci,callsign_telephonie=d.nouvelle_telephonie WHERE id=c.id;
    PERFORM set_config('app.identite_demande_id','',true);
  END IF;
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.proteger_identite_compagnie()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code_oaci IS DISTINCT FROM OLD.code_oaci OR NEW.callsign_telephonie IS DISTINCT FROM OLD.callsign_telephonie THEN
    IF NOT EXISTS(SELECT 1 FROM compagnie_identite_demandes d
      WHERE d.id::text=current_setting('app.identite_demande_id',true) AND d.compagnie_id=NEW.id
      AND d.statut='approuvee' AND d.nouveau_code_oaci=NEW.code_oaci AND d.nouvelle_telephonie=NEW.callsign_telephonie
      AND d.ancien_code_oaci IS NOT DISTINCT FROM OLD.code_oaci
      AND d.ancienne_telephonie IS NOT DISTINCT FROM OLD.callsign_telephonie) THEN
      RAISE EXCEPTION 'Toute modification d’identité radio nécessite une approbation IFSA' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS compagnie_identite_approbation ON public.compagnies;
CREATE TRIGGER compagnie_identite_approbation BEFORE UPDATE OF code_oaci,callsign_telephonie ON public.compagnies
FOR EACH ROW EXECUTE FUNCTION public.proteger_identite_compagnie();
REVOKE ALL ON FUNCTION public.demander_identite_compagnie(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.decider_identite_compagnie(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.proteger_identite_compagnie() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.demander_identite_compagnie(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decider_identite_compagnie(uuid,uuid,text,text) TO service_role;
COMMIT;
