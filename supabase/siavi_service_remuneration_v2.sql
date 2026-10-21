BEGIN;
ALTER TABLE public.afis_sessions ADD COLUMN IF NOT EXISTS salaire_depuis timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.afis_sessions ADD COLUMN IF NOT EXISTS salaire_reste numeric NOT NULL DEFAULT 0;
-- Service mutations must pass server-side role/airport checks.
REVOKE INSERT,UPDATE,DELETE ON public.afis_sessions FROM anon,authenticated;
CREATE TABLE IF NOT EXISTS public.siavi_service_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid, call_id uuid UNIQUE, fonction text NOT NULL, montant bigint NOT NULL CHECK(montant>=0),
 debut timestamptz, fin timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.siavi_service_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS siavi_service_payments_read ON public.siavi_service_payments;
CREATE POLICY siavi_service_payments_read ON public.siavi_service_payments FOR SELECT TO authenticated USING (user_id=auth.uid() OR EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role::text='admin'));

CREATE OR REPLACE FUNCTION public.siavi_credit_personnel(p_user uuid,p_amount bigint,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_account uuid;
BEGIN
 IF p_amount<=0 THEN RETURN; END IF;
 PERFORM 1 FROM profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agent introuvable'; END IF;
 SELECT id INTO v_account FROM felitz_comptes WHERE type='personnel' AND proprietaire_id=p_user ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF v_account IS NULL THEN
 INSERT INTO felitz_comptes(type,proprietaire_id,vban,solde) VALUES('personnel',p_user,'MIXOU'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,22)),0) RETURNING id INTO v_account;
 END IF;
 UPDATE felitz_comptes SET solde=solde+p_amount WHERE id=v_account;
 INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(v_account,'credit',p_amount,p_label);
END; $$;
REVOKE ALL ON FUNCTION public.siavi_credit_personnel(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siavi_credit_personnel(uuid,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_siavi_service_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_end timestamptz:=statement_timestamp();v_total numeric;v_amount bigint;
BEGIN
 IF TG_OP='INSERT' THEN NEW.salaire_depuis:=v_end;NEW.salaire_reste:=0;RETURN NEW;END IF;
 v_total:=greatest(0,extract(epoch FROM (v_end-OLD.salaire_depuis)))*(CASE WHEN OLD.est_afis THEN 200000 ELSE 100000 END)/3600+OLD.salaire_reste;
 v_amount:=floor(v_total);
 IF v_amount>0 THEN
  PERFORM public.siavi_credit_personnel(OLD.user_id,v_amount,CASE WHEN OLD.est_afis THEN 'Salaire AFIS · 200 000 F$/heure' ELSE 'Salaire pompier · 100 000 F$/heure' END);
  INSERT INTO siavi_service_payments(user_id,session_id,fonction,montant,debut,fin) VALUES(OLD.user_id,OLD.id,CASE WHEN OLD.est_afis THEN 'afis' ELSE 'pompier' END,v_amount,OLD.salaire_depuis,v_end);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 NEW.salaire_depuis:=v_end;NEW.salaire_reste:=v_total-v_amount;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.settle_siavi_service_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS siavi_service_settle ON public.afis_sessions;
CREATE TRIGGER siavi_service_settle BEFORE INSERT OR UPDATE OR DELETE ON public.afis_sessions FOR EACH ROW EXECUTE FUNCTION public.settle_siavi_service_trigger();

CREATE OR REPLACE FUNCTION public.pay_active_siavi_services()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
 UPDATE afis_sessions SET salaire_depuis=statement_timestamp() WHERE salaire_depuis<=statement_timestamp()-interval '1 hour';
 GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.pay_active_siavi_services() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pay_active_siavi_services() TO service_role;

CREATE OR REPLACE FUNCTION public.answer_siavi_call(p_user uuid,p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.afis_sessions%ROWTYPE;c public.atc_calls%ROWTYPE;v_inserted integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND (role::text IN ('admin','siavi') OR siavi IS TRUE)) THEN RETURN jsonb_build_object('error','Accès SIAVI requis','status',403);END IF;
 SELECT * INTO s FROM afis_sessions WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Prenez votre service avant de répondre','status',403);END IF;
 SELECT * INTO c FROM atc_calls WHERE id=p_call FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Appel introuvable','status',404);END IF;
 IF c.from_user_id=p_user OR c.to_user_id IS DISTINCT FROM p_user THEN RETURN jsonb_build_object('error','Appel non destiné à votre poste','status',403);END IF;
 IF c.status='connected' THEN RETURN jsonb_build_object('ok',true,'already_answered',true);END IF;
 IF c.status<>'ringing' THEN RETURN jsonb_build_object('error','Cet appel a déjà été traité','status',409);END IF;
 INSERT INTO siavi_service_payments(user_id,session_id,call_id,fonction,montant) VALUES(p_user,s.id,p_call,'appel',50000) ON CONFLICT(call_id) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 IF v_inserted=1 THEN PERFORM public.siavi_credit_personnel(p_user,50000,'Prime appel SIAVI décroché · '||p_call::text);END IF;
 UPDATE atc_calls SET status='connected',answered_at=statement_timestamp(),to_user_id=p_user WHERE id=p_call;
 RETURN jsonb_build_object('ok',true,'prime',CASE WHEN v_inserted=1 THEN 50000 ELSE 0 END);
END; $$;
REVOKE ALL ON FUNCTION public.answer_siavi_call(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.answer_siavi_call(uuid,uuid) TO service_role;
COMMIT;
