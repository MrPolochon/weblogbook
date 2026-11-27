BEGIN;
CREATE TABLE IF NOT EXISTS public.cpdlc_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 sender_user_id uuid, sender_user_ids uuid[] NOT NULL DEFAULT '{}', recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
 from_station text NOT NULL, to_station text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('CLEARANCE','FREE_TEXT','ATIS','WX','RESPONSE','SYSTEM')),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 12000),
 status text NOT NULL DEFAULT 'SENT' CHECK(status IN ('SENT','STANDBY','CLEAR','REFUSED','WILCO','UNABLE','ROGER','TIMED_OUT')),
 plan_id uuid REFERENCES public.plans_vol(id) ON DELETE SET NULL,
 recipient_plan_id uuid REFERENCES public.plans_vol(id) ON DELETE SET NULL,
 assigned_session_id uuid, reply_to uuid REFERENCES public.cpdlc_messages(id),
 deadline_at timestamptz, response_required boolean NOT NULL DEFAULT false,
 late boolean NOT NULL DEFAULT false, payload jsonb NOT NULL DEFAULT '{}', client_request_id text NOT NULL,
 UNIQUE(sender_user_id,client_request_id)
);
CREATE INDEX IF NOT EXISTS cpdlc_messages_plan_idx ON public.cpdlc_messages(plan_id,created_at);
CREATE INDEX IF NOT EXISTS cpdlc_messages_recipient_plan_idx ON public.cpdlc_messages(recipient_plan_id,created_at);
CREATE INDEX IF NOT EXISTS cpdlc_messages_recipient_idx ON public.cpdlc_messages USING gin(recipient_user_ids);
CREATE INDEX IF NOT EXISTS cpdlc_messages_sender_idx ON public.cpdlc_messages USING gin(sender_user_ids);
CREATE INDEX IF NOT EXISTS cpdlc_messages_pending_idx ON public.cpdlc_messages(deadline_at) WHERE deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS cpdlc_messages_recovery_idx ON public.cpdlc_messages((payload->>'airport'),id)
 WHERE kind IN ('CLEARANCE','FREE_TEXT','RESPONSE') AND status IN ('SENT','STANDBY','TIMED_OUT','WILCO','UNABLE','ROGER') AND recipient_plan_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cpdlc_messages_timeout_idx ON public.cpdlc_messages(reply_to) WHERE kind='SYSTEM' AND payload->>'event'='timeout';
CREATE TABLE IF NOT EXISTS public.cpdlc_receipts (
 message_id uuid NOT NULL REFERENCES public.cpdlc_messages(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.cpdlc_operations (
 actor_id uuid NOT NULL, request_id text NOT NULL, message_id uuid NOT NULL REFERENCES public.cpdlc_messages(id) ON DELETE CASCADE,
 PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE public.cpdlc_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpdlc_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpdlc_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cpdlc_messages,public.cpdlc_receipts,public.cpdlc_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cpdlc_messages,public.cpdlc_receipts,public.cpdlc_operations TO service_role;

-- All operations are called only by the authenticated server route. Parent rows
-- are locked so simultaneous answers, retries and timeout polls cannot duplicate events.
CREATE OR REPLACE FUNCTION public.cpdlc_apply(p_actor uuid,p_action text,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent cpdlc_messages%ROWTYPE; message cpdlc_messages%ROWTYPE; result uuid; target uuid; target_session uuid;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION REQUIRED'; END IF;
 IF p_action IN ('send','reply','transfer') THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||coalesce(p_data->>'client_request_id',''),0));
   SELECT message_id INTO result FROM cpdlc_operations WHERE actor_id=p_actor AND request_id=p_data->>'client_request_id';
   IF FOUND THEN RETURN result; END IF;
   SELECT id INTO result FROM cpdlc_messages WHERE sender_user_id=p_actor AND client_request_id=p_data->>'client_request_id';
   IF FOUND THEN RETURN result; END IF;
 END IF;
 IF p_action IN ('ack','reply','transfer','expire','assign') THEN
   SELECT * INTO parent FROM cpdlc_messages WHERE id=(p_data->>'message_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'MESSAGE NOT FOUND'; END IF;
   IF p_action IN ('ack','reply','transfer') AND NOT(p_actor=ANY(parent.recipient_user_ids)) THEN RAISE EXCEPTION 'NOT A RECIPIENT'; END IF;
   IF p_action='expire' AND NOT(p_actor=ANY(parent.recipient_user_ids) OR p_actor=ANY(parent.sender_user_ids)) THEN RAISE EXCEPTION 'NOT A PARTICIPANT'; END IF;
 END IF;
 IF p_action='ack' THEN
   IF parent.assigned_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM atc_sessions WHERE id=parent.assigned_session_id AND user_id=p_actor) THEN RAISE EXCEPTION 'ATC SESSION CHANGED'; END IF;
   INSERT INTO cpdlc_receipts(message_id,user_id) VALUES(parent.id,p_actor) ON CONFLICT DO NOTHING;
   RETURN parent.id;
 ELSIF p_action='expire' THEN
   IF parent.deadline_at IS NULL OR parent.deadline_at>now() OR parent.status NOT IN ('SENT','STANDBY') THEN RETURN parent.id; END IF;
   UPDATE cpdlc_messages SET status='TIMED_OUT',deadline_at=NULL WHERE id=parent.id;
   INSERT INTO cpdlc_messages(sender_user_ids,recipient_user_ids,from_station,to_station,kind,body,status,plan_id,reply_to,assigned_session_id,client_request_id,payload)
   VALUES('{}',parent.sender_user_ids,parent.to_station,parent.from_station,'SYSTEM',
     'NO ANSWER - CONTACT '||coalesce(parent.payload->>'fallback_frequency','PUBLISHED ADVISORY FREQUENCY'),
     'TIMED_OUT',parent.plan_id,parent.id,(parent.payload->>'sender_session_id')::uuid,'timeout:'||parent.id,jsonb_build_object('event','timeout','recipient_mode',parent.payload->>'sender_mode'));
   RETURN parent.id;
 ELSIF p_action='assign' THEN
   -- Called by the server reconciler only after evaluating current coverage.
   IF parent.recipient_plan_id IS NOT NULL OR parent.payload->>'recipient_mode' IS DISTINCT FROM 'atc' THEN RETURN parent.id; END IF;
   IF parent.kind IN ('CLEARANCE','FREE_TEXT') AND parent.status NOT IN ('SENT','STANDBY','TIMED_OUT') THEN RETURN parent.id; END IF;
   IF parent.kind='RESPONSE' AND EXISTS(SELECT 1 FROM cpdlc_receipts WHERE message_id=parent.id) THEN RETURN parent.id; END IF;
   IF parent.kind NOT IN ('CLEARANCE','FREE_TEXT','RESPONSE') THEN RETURN parent.id; END IF;
   IF parent.assigned_session_id IS DISTINCT FROM (p_data->>'expected_session_id')::uuid THEN RETURN parent.id; END IF;
   target:=(p_data->>'target_user_id')::uuid; target_session:=(p_data->>'target_session_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM atc_sessions WHERE id=target_session AND user_id=target) THEN RETURN parent.id; END IF;
   UPDATE cpdlc_messages SET recipient_user_ids=ARRAY[target],assigned_session_id=target_session WHERE id=parent.id;
   DELETE FROM cpdlc_receipts WHERE message_id=parent.id AND user_id=target;
   RETURN parent.id;
 ELSIF p_action='transfer' THEN
   IF parent.kind NOT IN ('CLEARANCE','FREE_TEXT') OR parent.status NOT IN ('SENT','STANDBY','TIMED_OUT') THEN RAISE EXCEPTION 'MESSAGE CANNOT BE TRANSFERRED'; END IF;
   IF NOT EXISTS(SELECT 1 FROM atc_sessions WHERE id=parent.assigned_session_id AND user_id=p_actor) THEN RAISE EXCEPTION 'ATC SESSION CHANGED'; END IF;
   target:=(p_data->>'target_user_id')::uuid; target_session:=(p_data->>'target_session_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM atc_sessions WHERE id=target_session AND user_id=target) THEN RAISE EXCEPTION 'TARGET STATION OFFLINE'; END IF;
   UPDATE cpdlc_messages SET recipient_user_ids=ARRAY[target],assigned_session_id=target_session,
      payload=jsonb_set(payload,'{transfers}',coalesce(payload->'transfers','[]')||jsonb_build_array(jsonb_build_object('from',p_actor,'to',target,'at',now()))) WHERE id=parent.id;
   DELETE FROM cpdlc_receipts WHERE message_id=parent.id AND user_id=target;
   INSERT INTO cpdlc_operations(actor_id,request_id,message_id) VALUES(p_actor,p_data->>'client_request_id',parent.id);
   RETURN parent.id;
 ELSIF p_action='reply' THEN
   IF parent.assigned_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM atc_sessions WHERE id=parent.assigned_session_id AND user_id=p_actor) THEN RAISE EXCEPTION 'ATC SESSION CHANGED'; END IF;
   IF p_data->>'status' IN ('CLEAR','REFUSED') AND parent.status NOT IN ('SENT','STANDBY','TIMED_OUT') THEN RAISE EXCEPTION 'REQUEST ALREADY ANSWERED'; END IF;
   IF p_data->>'status' IN ('WILCO','UNABLE','STANDBY') AND parent.status NOT IN ('CLEAR','STANDBY','SENT','TIMED_OUT') THEN RAISE EXCEPTION 'MESSAGE ALREADY ANSWERED'; END IF;
   UPDATE cpdlc_messages SET status=CASE WHEN p_data->>'status'='SENT' THEN status ELSE p_data->>'status' END,
     deadline_at=CASE WHEN p_data->>'status'='STANDBY' THEN deadline_at ELSE NULL END WHERE id=parent.id;
   INSERT INTO cpdlc_receipts(message_id,user_id) VALUES(parent.id,p_actor) ON CONFLICT DO NOTHING;
 END IF;
 IF p_action NOT IN ('send','reply') THEN RAISE EXCEPTION 'UNKNOWN ACTION'; END IF;
 message:=jsonb_populate_record(NULL::cpdlc_messages,p_data - 'id' - 'created_at');
 INSERT INTO cpdlc_messages(sender_user_id,sender_user_ids,recipient_user_ids,from_station,to_station,kind,body,status,
   plan_id,recipient_plan_id,assigned_session_id,reply_to,deadline_at,response_required,late,payload,client_request_id)
 VALUES(p_actor,coalesce(message.sender_user_ids,ARRAY[p_actor]),coalesce(message.recipient_user_ids,'{}'),message.from_station,message.to_station,
   message.kind,message.body,coalesce(message.status,'SENT'),message.plan_id,message.recipient_plan_id,message.assigned_session_id,
   CASE WHEN p_action='reply' THEN parent.id ELSE message.reply_to END,message.deadline_at,coalesce(message.response_required,false),
   coalesce(p_action='reply' AND (parent.status='TIMED_OUT' OR parent.deadline_at<now()),false),coalesce(message.payload,'{}'),message.client_request_id) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cpdlc_apply(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cpdlc_apply(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.cpdlc_inbox(p_actor uuid,p_plan uuid,p_session uuid)
RETURNS SETOF public.cpdlc_messages LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH scoped AS MATERIALIZED (
   SELECT m.* FROM cpdlc_messages m WHERE p_actor IS NOT NULL AND (
     (p_plan IS NOT NULL AND (m.plan_id=p_plan OR m.recipient_plan_id=p_plan)
       AND (p_actor=ANY(m.sender_user_ids) OR p_actor=ANY(m.recipient_user_ids)))
     OR (p_plan IS NULL AND p_session IS NOT NULL
       AND EXISTS(SELECT 1 FROM atc_sessions s WHERE s.id=p_session AND s.user_id=p_actor)
       AND ((m.payload->>'sender_mode'='atc' AND m.sender_user_id=p_actor AND m.payload->>'sender_session_id'=p_session::text)
         OR (m.payload->>'recipient_mode'='atc' AND p_actor=ANY(m.recipient_user_ids) AND m.assigned_session_id=p_session)))
   )
 ), recent AS (SELECT id FROM scoped ORDER BY created_at DESC,id DESC LIMIT 500)
 SELECT s.* FROM scoped s WHERE s.id IN (SELECT id FROM recent)
   OR (p_actor=ANY(s.recipient_user_ids) AND NOT EXISTS(SELECT 1 FROM cpdlc_receipts r WHERE r.message_id=s.id AND r.user_id=p_actor))
 ORDER BY s.created_at DESC,s.id DESC;
$$;
REVOKE ALL ON FUNCTION public.cpdlc_inbox(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cpdlc_inbox(uuid,uuid,uuid) TO service_role;
COMMIT;
