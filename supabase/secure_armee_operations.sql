-- Après add_armee_features.sql. Toutes les mutations sont réservées au serveur.
BEGIN;
ALTER TABLE public.armee_missions_log ADD COLUMN IF NOT EXISTS vol_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS armee_missions_log_one_payment_per_vol
  ON public.armee_missions_log(vol_id) WHERE vol_id IS NOT NULL;
-- Pas de suppression ni de rapprochement automatique des anciens journaux.
CREATE TABLE IF NOT EXISTS public.armee_operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vol_id UUID, -- conserver l'audit même si un ancien vol est supprimé
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS armee_operations_log_created ON public.armee_operations_log(created_at DESC);
ALTER TABLE public.armee_operations_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.armee_operations_log FROM anon, authenticated;
GRANT ALL ON public.armee_operations_log TO service_role;

CREATE OR REPLACE FUNCTION public.save_armee_vol(
  p_actor UUID, p_vol_id UUID, p_row JSONB, p_equipage UUID[],
  p_cooldown INTEGER DEFAULT 0, p_min_missions INTEGER DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.vols%ROWTYPE; old_v public.vols%ROWTYPE; actor public.profiles%ROWTYPE;
  member_id UUID; avion_nom TEXT; last_completion TIMESTAMPTZ;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor;
  IF NOT FOUND OR (NOT coalesce(actor.armee, false) AND coalesce(actor.role, '') <> 'admin')
    OR actor.blocked_until > now() THEN
    RAISE EXCEPTION 'Accès Armée suspendu ou non autorisé' USING ERRCODE = '42501';
  END IF;
  -- Même ordre de verrouillage pour dépôt, modification et validation.
  IF p_vol_id IS NOT NULL THEN
    SELECT * INTO old_v FROM public.vols WHERE id = p_vol_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vol introuvable'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('armee:' || old_v.pilote_id::text, 0));
    SELECT * INTO old_v FROM public.vols WHERE id = p_vol_id FOR UPDATE;
    IF old_v.type_vol <> 'Vol militaire' OR old_v.mission_reward_final IS NOT NULL OR old_v.mission_status = 'echec' THEN
      RAISE EXCEPTION 'Un vol payé ne peut plus être modifié';
    END IF;
    IF coalesce(actor.role, '') <> 'admin' AND (old_v.statut NOT IN ('en_attente', 'refusé') OR
      NOT (p_actor = old_v.pilote_id OR p_actor = coalesce(old_v.copilote_id, old_v.pilote_id)
        OR p_actor = coalesce(old_v.chef_escadron_id, old_v.pilote_id))) THEN
      RAISE EXCEPTION 'Modification non autorisée' USING ERRCODE = '42501';
    END IF;
    v := jsonb_populate_record(old_v, p_row);
    IF v.pilote_id IS DISTINCT FROM old_v.pilote_id OR v.mission_id IS DISTINCT FROM old_v.mission_id
      OR v.type_vol IS DISTINCT FROM old_v.type_vol THEN RAISE EXCEPTION 'Identité du dossier non modifiable'; END IF;
  ELSE
    v := jsonb_populate_record(NULL::public.vols, p_row);
    PERFORM pg_advisory_xact_lock(hashtextextended('armee:' || v.pilote_id::text, 0));
    v.id := gen_random_uuid(); v.created_at := now();
    IF v.type_vol <> 'Vol militaire' OR v.statut <> 'en_attente'
      OR (p_actor <> v.pilote_id AND p_actor IS DISTINCT FROM v.copilote_id) THEN
      RAISE EXCEPTION 'Identité du dossier invalide';
    END IF;
  END IF;
  IF v.duree_minutes IS NULL OR v.duree_minutes < 1 OR v.duree_minutes > 1440
    OR v.depart_utc IS NULL OR length(trim(coalesce(v.commandant_bord, ''))) NOT BETWEEN 1 AND 100
    OR v.escadrille_ou_escadron NOT IN ('escadrille', 'escadron', 'autre')
    OR v.pilote_id = v.copilote_id THEN RAISE EXCEPTION 'Formulaire de vol invalide'; END IF;
  IF v.chef_escadron_id IS NOT NULL AND v.chef_escadron_id <> v.pilote_id THEN
    RAISE EXCEPTION 'Le chef du dossier doit être son pilote';
  END IF;
  FOREACH member_id IN ARRAY array_remove(ARRAY[v.pilote_id, v.copilote_id, v.chef_escadron_id] || coalesce(p_equipage,
    (SELECT array_agg(profile_id) FROM public.vols_equipage_militaire WHERE vol_id = v.id), '{}'::uuid[]), NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = member_id AND
      (armee = true OR (id = p_actor AND role = 'admin')) AND (blocked_until IS NULL OR blocked_until <= now())) THEN
      RAISE EXCEPTION 'Chaque participant doit être un militaire habilité';
    END IF;
  END LOOP;
  SELECT coalesce(nullif(trim(a.nom_personnalise), ''), t.nom) INTO avion_nom
    FROM public.armee_avions a JOIN public.types_avion t ON t.id = a.type_avion_id
    WHERE a.id = v.armee_avion_id AND NOT a.detruit AND t.est_militaire;
  IF avion_nom IS NULL THEN RAISE EXCEPTION 'Appareil militaire indisponible'; END IF;
  IF v.mission_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.vols WHERE pilote_id = v.pilote_id AND mission_id = v.mission_id
      AND type_vol = 'Vol militaire' AND id <> v.id AND mission_reward_final IS NULL
      AND (statut = 'en_attente' OR (statut = 'refusé' AND coalesce(mission_status, '') <> 'echec'))) THEN
      RAISE EXCEPTION 'Un dossier pour cette mission est déjà ouvert' USING ERRCODE = '23505';
    END IF;
    SELECT max(created_at) INTO last_completion FROM public.armee_missions_log
      WHERE user_id = v.pilote_id AND mission_id = v.mission_id;
    IF last_completion + make_interval(mins => p_cooldown) > now() THEN RAISE EXCEPTION 'Délai entre missions non terminé'; END IF;
    IF (SELECT count(*) FROM public.armee_missions_log WHERE user_id = v.pilote_id) < p_min_missions THEN
      RAISE EXCEPTION 'Grade insuffisant pour cette mission';
    END IF;
  END IF;
  v.type_avion_militaire := avion_nom;
  v.arrivee_utc := v.depart_utc + make_interval(mins => v.duree_minutes);
  IF p_vol_id IS NULL THEN
    INSERT INTO public.vols (id, pilote_id, copilote_id, copilote_confirme_par_pilote,
      compagnie_libelle, type_avion_militaire, armee_avion_id, mission_id, mission_titre,
      mission_reward_base, mission_status, mission_refusals, escadrille_ou_escadron,
      chef_escadron_id, nature_vol_militaire, nature_vol_militaire_autre,
      aeroport_depart, aeroport_arrivee, duree_minutes, depart_utc, arrivee_utc,
      type_vol, commandant_bord, role_pilote, callsign, statut, created_by_admin, created_at)
    VALUES (v.id, v.pilote_id, v.copilote_id, false, 'Vol militaire', avion_nom, v.armee_avion_id,
      v.mission_id, v.mission_titre, v.mission_reward_base, v.mission_status, 0,
      v.escadrille_ou_escadron, v.chef_escadron_id, v.nature_vol_militaire, v.nature_vol_militaire_autre,
      v.aeroport_depart, v.aeroport_arrivee, v.duree_minutes, v.depart_utc, v.arrivee_utc,
      'Vol militaire', v.commandant_bord, v.role_pilote, v.callsign, 'en_attente', false, now());
  ELSE
    PERFORM set_config('app.armee_edit', '1', true);
    UPDATE public.vols SET aeroport_depart = v.aeroport_depart, aeroport_arrivee = v.aeroport_arrivee,
      duree_minutes = v.duree_minutes, depart_utc = v.depart_utc, arrivee_utc = v.arrivee_utc,
      commandant_bord = v.commandant_bord, callsign = v.callsign, armee_avion_id = v.armee_avion_id,
      type_avion_militaire = avion_nom, escadrille_ou_escadron = v.escadrille_ou_escadron,
      nature_vol_militaire = v.nature_vol_militaire, nature_vol_militaire_autre = v.nature_vol_militaire_autre,
      copilote_id = v.copilote_id, chef_escadron_id = v.chef_escadron_id,
      statut = CASE WHEN old_v.statut = 'refusé' THEN 'en_attente' ELSE statut END,
      refusal_reason = CASE WHEN old_v.statut = 'refusé' THEN NULL ELSE refusal_reason END
      WHERE id = v.id;
    PERFORM set_config('app.armee_edit', '', true);
  END IF;
  IF p_equipage IS NOT NULL THEN
    DELETE FROM public.vols_equipage_militaire WHERE vol_id = v.id;
    INSERT INTO public.vols_equipage_militaire(vol_id, profile_id)
      SELECT v.id, x FROM (SELECT DISTINCT unnest(p_equipage) AS x) q;
  END IF;
  INSERT INTO public.armee_operations_log(vol_id, actor_id, action, details)
    VALUES (v.id, p_actor, CASE WHEN p_vol_id IS NULL THEN 'depot' ELSE 'modification' END,
      jsonb_build_object('avant', CASE WHEN p_vol_id IS NULL THEN NULL ELSE to_jsonb(old_v) END, 'apres', p_row));
  RETURN v.id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_armee_vol(
  p_actor UUID, p_vol_id UUID, p_decision TEXT, p_reason TEXT,
  p_cooldown INTEGER DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.vols%ROWTYPE; actor public.profiles%ROWTYPE; account_id UUID;
  last_completion TIMESTAMPTZ; reward INTEGER; bonus INTEGER; delay_m INTEGER;
  streak INTEGER := 1; pct INTEGER; day_cursor DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor;
  IF NOT FOUND OR actor.blocked_until > now() OR (coalesce(actor.role, '') <> 'admin' AND NOT EXISTS
    (SELECT 1 FROM public.felitz_comptes WHERE type = 'militaire' AND proprietaire_id = p_actor)) THEN
    RAISE EXCEPTION 'Validation non autorisée' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('validé', 'refusé') THEN RAISE EXCEPTION 'Décision invalide'; END IF;
  SELECT * INTO v FROM public.vols WHERE id = p_vol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vol introuvable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('armee:' || v.pilote_id::text, 0));
  SELECT * INTO v FROM public.vols WHERE id = p_vol_id FOR UPDATE;
  IF v.type_vol <> 'Vol militaire' THEN RAISE EXCEPTION 'Ce vol n''est pas militaire'; END IF;
  IF v.statut = p_decision THEN RETURN jsonb_build_object('ok', true, 'alreadyProcessed', true); END IF;
  IF v.mission_reward_final IS NOT NULL OR v.statut = 'validé' OR v.mission_status = 'echec' THEN
    RAISE EXCEPTION 'Ce dossier est déjà terminé';
  END IF;
  IF p_decision = 'validé' AND v.arrivee_utc > now() THEN RAISE EXCEPTION 'Le vol ne peut pas être validé avant son arrivée'; END IF;
  PERFORM set_config('app.armee_decision', '1', true);
  IF p_decision = 'validé' AND v.mission_id IS NOT NULL THEN
    SELECT max(created_at) INTO last_completion FROM public.armee_missions_log
      WHERE user_id = v.pilote_id AND mission_id = v.mission_id;
    IF last_completion + make_interval(mins => p_cooldown) > now() THEN RAISE EXCEPTION 'Délai entre missions non terminé'; END IF;
    SELECT id INTO STRICT account_id FROM public.felitz_comptes WHERE type = 'militaire' FOR UPDATE;
    IF v.mission_reward_base IS NULL OR v.mission_reward_base <= 0 THEN RAISE EXCEPTION 'Base de récompense manquante'; END IF;
    -- Ponctualité figée au dépôt, jamais à la disponibilité du validateur.
    delay_m := greatest(0, round(extract(epoch FROM (v.created_at - v.arrivee_utc)) / 60)::integer);
    reward := greatest(0, round(v.mission_reward_base * greatest(0.2, 1 - delay_m * 0.01))::integer);
    LOOP
      day_cursor := day_cursor - 1;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.armee_missions_log WHERE user_id = v.pilote_id
        AND (created_at AT TIME ZONE 'UTC')::date = day_cursor);
      streak := streak + 1;
    END LOOP;
    pct := CASE WHEN streak >= 7 THEN 15 WHEN streak >= 5 THEN 10 WHEN streak >= 3 THEN 5 ELSE 0 END;
    bonus := round(reward * pct / 100.0)::integer; reward := reward + bonus;
    UPDATE public.felitz_comptes SET solde = solde + reward WHERE id = account_id;
    INSERT INTO public.felitz_transactions(compte_id, type, montant, libelle)
      VALUES (account_id, 'credit', reward, 'Mission militaire: ' || coalesce(v.mission_titre, v.mission_id) || ' · vol ' || v.id::text);
    INSERT INTO public.armee_missions_log(vol_id, mission_id, user_id, reward, streak_bonus)
      VALUES (v.id, v.mission_id, v.pilote_id, reward, bonus);
    UPDATE public.vols SET mission_reward_final = reward, mission_delay_minutes = delay_m,
      mission_status = 'valide', mission_streak_days = streak, mission_streak_bonus = bonus WHERE id = v.id;
  END IF;
  UPDATE public.vols SET statut = p_decision, editing_by_pilot_id = NULL, editing_started_at = NULL,
    refusal_reason = CASE WHEN p_decision = 'refusé' THEN left(p_reason, 2000) ELSE NULL END,
    refusal_count = coalesce(refusal_count, 0) + CASE WHEN p_decision = 'refusé' THEN 1 ELSE 0 END,
    mission_refusals = coalesce(mission_refusals, 0) + CASE WHEN p_decision = 'refusé' AND mission_id IS NOT NULL THEN 1 ELSE 0 END,
    mission_status = CASE WHEN p_decision = 'refusé' AND mission_id IS NOT NULL THEN
      CASE WHEN coalesce(mission_refusals, 0) + 1 >= 3 THEN 'echec' ELSE 'en_attente' END ELSE mission_status END
    WHERE id = v.id;
  INSERT INTO public.armee_operations_log(vol_id, actor_id, action, details)
    VALUES (v.id, p_actor, p_decision, jsonb_build_object('motif', left(p_reason, 2000), 'recompense', reward));
  PERFORM set_config('app.armee_decision', '', true);
  RETURN jsonb_build_object('ok', true, 'reward', reward);
END $$;

REVOKE ALL ON FUNCTION public.save_armee_vol(UUID, UUID, JSONB, UUID[], INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_armee_vol(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_armee_vol(UUID, UUID, JSONB, UUID[], INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_armee_vol(UUID, UUID, TEXT, TEXT, INTEGER) TO service_role;
CREATE OR REPLACE FUNCTION public.get_armee_pilot_stats(p_user UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'completed', (SELECT count(*) FROM armee_missions_log WHERE user_id = p_user),
    'reward', (SELECT coalesce(sum(reward), 0) FROM armee_missions_log WHERE user_id = p_user),
    'dates', (SELECT coalesce(jsonb_agg(day ORDER BY day DESC), '[]'::jsonb) FROM
      (SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date AS day FROM armee_missions_log WHERE user_id = p_user) dates),
    'attempted', count(*),
    'validated', count(*) FILTER (WHERE mission_status = 'valide' OR statut = 'validé'),
    'failed', count(*) FILTER (WHERE mission_status = 'echec')
  ) FROM vols WHERE pilote_id = p_user AND type_vol = 'Vol militaire' AND mission_id IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.get_armee_honor_board(p_days INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(result) ORDER BY "missionsCount" DESC, "totalReward" DESC, "userId"), '[]'::jsonb)
  FROM (SELECT l.user_id AS "userId", p.identifiant, count(*) AS "missionsCount", sum(l.reward) AS "totalReward"
    FROM armee_missions_log l JOIN profiles p ON p.id = l.user_id
    WHERE l.created_at >= now() - make_interval(days => CASE WHEN p_days = 30 THEN 30 ELSE 7 END)
    GROUP BY l.user_id, p.identifiant ORDER BY count(*) DESC, sum(l.reward) DESC, l.user_id LIMIT 10) result
$$;
REVOKE ALL ON FUNCTION public.get_armee_pilot_stats(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_armee_honor_board(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_armee_pilot_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_armee_honor_board(INTEGER) TO service_role;
CREATE OR REPLACE FUNCTION public.delete_armee_vol(p_actor UUID, p_vol_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vols%ROWTYPE; actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = p_actor;
  IF NOT FOUND OR actor.blocked_until > now() OR (NOT coalesce(actor.armee, false) AND coalesce(actor.role, '') <> 'admin') THEN
    RAISE EXCEPTION 'Accès Armée suspendu ou non autorisé' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM vols WHERE id = p_vol_id FOR UPDATE;
  IF NOT FOUND OR v.type_vol <> 'Vol militaire' THEN RAISE EXCEPTION 'Vol militaire introuvable'; END IF;
  IF v.mission_reward_final IS NOT NULL THEN RAISE EXCEPTION 'Un vol payé doit être conservé dans l''historique'; END IF;
  IF coalesce(actor.role, '') <> 'admin' AND NOT
    (p_actor = v.pilote_id OR p_actor = coalesce(v.copilote_id, v.pilote_id) OR p_actor = coalesce(v.chef_escadron_id, v.pilote_id)) THEN
    RAISE EXCEPTION 'Suppression non autorisée' USING ERRCODE = '42501';
  END IF;
  INSERT INTO armee_operations_log(vol_id, actor_id, action, details) VALUES (v.id, p_actor, 'suppression', to_jsonb(v));
  DELETE FROM vols_equipage_militaire WHERE vol_id = v.id;
  DELETE FROM vols WHERE id = v.id;
  RETURN true;
END $$;
-- Préserver le lien du paiement même lors d'un accès direct autorisé à la table.
CREATE OR REPLACE FUNCTION public.protect_paid_armee_vol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.type_vol = 'Vol militaire' AND OLD.mission_reward_final IS NOT NULL THEN
    -- Une suppression de profil cascade est une opération administrative distincte.
    -- Conserver la preuve financière sans bloquer la suppression du compte.
    IF pg_trigger_depth() > 1 THEN
      INSERT INTO public.armee_operations_log(vol_id, action, details) VALUES
        (OLD.id, 'archivage_profil', jsonb_build_object('mission', OLD.mission_titre,
          'recompense', OLD.mission_reward_final, 'pilote_id', OLD.pilote_id));
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Un vol militaire payé doit être conservé';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_paid_armee_vol ON public.vols;
CREATE TRIGGER protect_paid_armee_vol BEFORE DELETE ON public.vols FOR EACH ROW EXECUTE FUNCTION public.protect_paid_armee_vol();
CREATE OR REPLACE FUNCTION public.protect_armee_decision()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.type_vol = 'Vol militaire' THEN
    IF OLD.mission_reward_final IS NOT NULL
      AND (NEW.statut IS DISTINCT FROM OLD.statut OR NEW.mission_reward_final IS DISTINCT FROM OLD.mission_reward_final)
      AND coalesce(current_setting('app.armee_decision', true), '') <> '1'
      AND NOT (coalesce(current_setting('app.armee_edit', true), '') = '1'
        AND OLD.statut = 'refusé' AND NEW.statut = 'en_attente' AND NEW.mission_reward_final IS NULL) THEN
      RAISE EXCEPTION 'Une décision militaire doit passer par la validation sécurisée';
    END IF;
    IF OLD.mission_reward_final IS NOT NULL AND (
      NEW.pilote_id IS DISTINCT FROM OLD.pilote_id OR NEW.mission_id IS DISTINCT FROM OLD.mission_id
      OR NEW.type_vol IS DISTINCT FROM OLD.type_vol OR NEW.mission_reward_final IS DISTINCT FROM OLD.mission_reward_final
      OR NEW.aeroport_depart IS DISTINCT FROM OLD.aeroport_depart OR NEW.aeroport_arrivee IS DISTINCT FROM OLD.aeroport_arrivee
      OR NEW.depart_utc IS DISTINCT FROM OLD.depart_utc OR NEW.arrivee_utc IS DISTINCT FROM OLD.arrivee_utc
      OR NEW.duree_minutes IS DISTINCT FROM OLD.duree_minutes OR NEW.armee_avion_id IS DISTINCT FROM OLD.armee_avion_id) THEN
      RAISE EXCEPTION 'Les données d''un vol militaire payé doivent être conservées';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_armee_decision ON public.vols;
CREATE TRIGGER protect_armee_decision BEFORE UPDATE ON public.vols FOR EACH ROW EXECUTE FUNCTION public.protect_armee_decision();
CREATE OR REPLACE FUNCTION public.save_armee_briefing(p_actor UUID, p_title TEXT, p_content TEXT, p_active BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = p_actor;
  IF NOT FOUND OR actor.blocked_until > now() OR (coalesce(actor.role, '') <> 'admin' AND NOT EXISTS
    (SELECT 1 FROM felitz_comptes WHERE type = 'militaire' AND proprietaire_id = p_actor)) THEN
    RAISE EXCEPTION 'Publication non autorisée' USING ERRCODE = '42501';
  END IF;
  IF length(p_title) > 150 OR length(p_content) > 10000 OR (p_active AND trim(coalesce(p_content, '')) = '') THEN
    RAISE EXCEPTION 'Briefing invalide';
  END IF;
  INSERT INTO armee_briefing(id, titre, contenu, actif, updated_by, updated_at)
    VALUES (1, coalesce(nullif(trim(p_title), ''), 'Briefing opérationnel'), coalesce(p_content, ''), p_active, p_actor, now())
    ON CONFLICT (id) DO UPDATE SET titre = excluded.titre, contenu = excluded.contenu,
      actif = excluded.actif, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO armee_operations_log(actor_id, action, details) VALUES (p_actor, 'briefing', jsonb_build_object('titre', p_title, 'actif', p_active));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_armee_vol(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_armee_briefing(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_armee_vol(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_armee_briefing(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
COMMIT;
