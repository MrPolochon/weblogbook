-- Deploy this migration before the application.
-- Existing loans retain their original interest, deadline and flight repayment mode.
BEGIN;
ALTER TABLE public.prets_bancaires
  ADD COLUMN IF NOT EXISTS mode_remboursement text NOT NULL DEFAULT 'vols',
  ADD COLUMN IF NOT EXISTS duree_jours integer,
  ADD COLUMN IF NOT EXISTS capital_souscription bigint;
ALTER TABLE public.prets_bancaires DROP CONSTRAINT IF EXISTS unique_pret_actif;
CREATE UNIQUE INDEX IF NOT EXISTS prets_one_active_company
  ON public.prets_bancaires(compagnie_id) WHERE statut='actif';
ALTER TABLE public.prets_bancaires DROP CONSTRAINT IF EXISTS prets_schedule_check;
ALTER TABLE public.prets_bancaires ADD CONSTRAINT prets_schedule_check CHECK (
  mode_remboursement='vols' OR (mode_remboursement IN ('quotidien','echeance')
    AND duree_jours IS NOT NULL AND duree_jours BETWEEN 1 AND 90 AND echeance_at IS NOT NULL)
);
-- All changes go through the authorized, atomic service operations.
DROP POLICY IF EXISTS prets_insert ON public.prets_bancaires;
DROP POLICY IF EXISTS prets_update ON public.prets_bancaires;
REVOKE INSERT, UPDATE, DELETE ON public.prets_bancaires FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.company_loan_operations (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  company_id uuid NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  loan_id uuid REFERENCES public.prets_bancaires(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK(operation IN ('borrow','repay')),
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_loan_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_loan_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.company_loan_operations TO service_role;

CREATE OR REPLACE FUNCTION public.assert_company_loan_actor(p_actor uuid,p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM compagnies WHERE id=p_company) THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Compagnie introuvable.';
  END IF;
  IF p_actor IS NULL OR NOT (
    EXISTS(SELECT 1 FROM compagnies WHERE id=p_company AND pdg_id=p_actor)
    OR EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin')
    OR EXISTS(SELECT 1 FROM compagnie_employes WHERE compagnie_id=p_company AND pilote_id=p_actor AND role='co_pdg')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Accès réservé à la direction de la compagnie.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_terms(p_amount numeric,p_days numeric,p_offer text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE rate90 numeric; points integer; interest bigint;
BEGIN
  IF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 10000000 OR trunc(p_amount)<>p_amount
     OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 90 OR trunc(p_days)<>p_days
     OR p_offer IS NULL OR p_offer NOT IN ('standard','personnalise')
     OR (p_offer='personnalise' AND p_amount<1000000)
     OR (p_offer='standard' AND p_amount NOT IN (200000,500000,1000000,5000000)) THEN
    RAISE EXCEPTION 'Prêt personnalisé : 1 à 10 millions de F$, durée de 1 à 90 jours.';
  END IF;
  rate90:=CASE WHEN p_amount<=200000 THEN 1.5
    WHEN p_amount<=500000 THEN 1.5+(p_amount-200000)*3.5/300000
    WHEN p_amount<=1000000 THEN 5+(p_amount-500000)*5/500000
    WHEN p_amount<=5000000 THEN 10+(p_amount-1000000)*10/4000000
    ELSE 20+(p_amount-5000000)*10/5000000 END;
  points:=round(rate90*p_days/90*100);
  interest:=round(p_amount*points/10000);
  RETURN jsonb_build_object('montant',p_amount,'dureeJours',p_days,'tauxInteret',points/100.0,
    'interets',interest,'total',p_amount+interest);
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_capital(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cash bigint; fleet bigint; debt bigint; capital bigint;
BEGIN
  SELECT solde INTO cash FROM felitz_comptes WHERE compagnie_id=p_company AND type='entreprise';
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte de la compagnie introuvable.'; END IF;
  -- compagnie_id denotes ownership. Inbound leases remain owned by their lessor.
  SELECT coalesce(sum(greatest(0,coalesce(t.prix,0))),0) INTO fleet
    FROM compagnie_avions a JOIN types_avion t ON t.id=a.type_avion_id
    WHERE a.compagnie_id=p_company AND NOT coalesce(a.detruit,false);
  SELECT coalesce(sum(greatest(0,montant_total_du::bigint-montant_rembourse)),0) INTO debt
    FROM prets_bancaires WHERE compagnie_id=p_company AND statut IN ('actif','defaut');
  capital:=greatest(0,cash+fleet-debt);
  RETURN jsonb_build_object('tresorerie',cash,'avions',fleet,'dettes',debt,'capital',capital,
    'plafond',least(10000000,capital));
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_dashboard(p_actor uuid,p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE capital jsonb; active jsonb; history jsonb;
BEGIN
  PERFORM assert_company_loan_actor(p_actor,p_company);
  capital:=company_loan_capital(p_company);
  SELECT to_jsonb(p) INTO active FROM prets_bancaires p
    WHERE compagnie_id=p_company AND statut='actif' ORDER BY created_at LIMIT 1;
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.rembourse_at DESC),'[]') INTO history
    FROM (SELECT * FROM prets_bancaires WHERE compagnie_id=p_company AND statut='rembourse'
      ORDER BY rembourse_at DESC LIMIT 10) h;
  RETURN jsonb_build_object('pretActif',active,'historique',history,'capacite',capital,
    'tauxPrelevement',30,'serverTime',now());
END $$;

CREATE OR REPLACE FUNCTION public.manage_company_loan(
  p_actor uuid,p_company uuid,p_operation text,p_request uuid,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior company_loan_operations%ROWTYPE; loan prets_bancaires%ROWTYPE;
  account felitz_comptes%ROWTYPE; amount numeric; days numeric; terms jsonb;
  capacity jsonb; remaining bigint; paid bigint; result jsonb; mode text; total bigint;
BEGIN
  PERFORM assert_company_loan_actor(p_actor,p_company);
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN ('borrow','repay') THEN
    RAISE EXCEPTION 'Demande bancaire invalide.';
  END IF;
  -- Same order/lock as the v2 flight settlement: no concurrent lost payment.
  PERFORM pg_advisory_xact_lock(hashtextextended('flight-economy-settlement:v2',0));
  PERFORM 1 FROM compagnies WHERE id=p_company FOR UPDATE;
  SELECT * INTO prior FROM company_loan_operations WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.actor_id<>p_actor OR prior.company_id<>p_company OR prior.operation<>p_operation OR prior.input<>p_input THEN
      RAISE EXCEPTION 'Identifiant de demande déjà utilisé pour une autre opération.';
    END IF;
    RETURN prior.result;
  END IF;
  IF jsonb_typeof(p_input->'montant') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Montant entier requis.'; END IF;
  amount:=(p_input->>'montant')::numeric;
  IF amount NOT BETWEEN 1 AND 9007199254740991 OR trunc(amount)<>amount THEN RAISE EXCEPTION 'Montant entier positif invalide.'; END IF;
  SELECT * INTO account FROM felitz_comptes WHERE compagnie_id=p_company AND type='entreprise' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte de la compagnie introuvable.'; END IF;
  IF p_operation='borrow' THEN
    IF jsonb_typeof(p_input->'duree_jours') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Durée entière requise.'; END IF;
    days:=(p_input->>'duree_jours')::numeric;
    terms:=company_loan_terms(amount,days,p_input->>'offre');
    mode:=p_input->>'mode_remboursement';
    IF mode IS NULL OR mode NOT IN ('quotidien','echeance') THEN RAISE EXCEPTION 'Mode de remboursement invalide.'; END IF;
    IF EXISTS(SELECT 1 FROM prets_bancaires WHERE compagnie_id=p_company AND statut IN ('actif','defaut')
      AND montant_rembourse<montant_total_du) THEN RAISE EXCEPTION 'Un prêt est déjà en cours. Soldez-le avant un nouvel emprunt.'; END IF;
    IF account.solde<0 THEN RAISE EXCEPTION 'Le compte doit être remis à niveau avant un nouvel emprunt.'; END IF;
    -- Lock the owned assets while the borrowing ceiling is measured.
    PERFORM a.id FROM compagnie_avions a WHERE a.compagnie_id=p_company FOR SHARE;
    capacity:=company_loan_capital(p_company);
    IF amount>(capacity->>'plafond')::numeric THEN
      RAISE EXCEPTION 'Emprunt supérieur au capital : plafond actuel % F$.',capacity->>'plafond';
    END IF;
    UPDATE prets_bancaires SET statut='rembourse',rembourse_at=coalesce(rembourse_at,now())
      WHERE compagnie_id=p_company AND statut='actif' AND montant_rembourse>=montant_total_du;
    total:=(terms->>'total')::bigint;
    INSERT INTO prets_bancaires(compagnie_id,demandeur_id,montant_emprunte,taux_interet,montant_total_du,
      montant_rembourse,statut,mode_remboursement,duree_jours,echeance_at,capital_souscription)
    VALUES(p_company,p_actor,amount,(terms->>'tauxInteret')::numeric,total,0,'actif',mode,days::integer,
      now()+days::double precision*interval '24 hours',(capacity->>'capital')::bigint) RETURNING * INTO loan;
    UPDATE felitz_comptes SET solde=solde+amount WHERE id=account.id;
    INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'credit',amount,
      'Prêt bancaire '||loan.id||' — '||amount||' F$, '||days||' jours, '||mode);
    result:=jsonb_build_object('ok',true,'pret',to_jsonb(loan),'message','Prêt accordé. Le capital est crédité sur le compte de la compagnie.');
  ELSE
    SELECT * INTO loan FROM prets_bancaires WHERE id=(p_input->>'pret_id')::uuid AND compagnie_id=p_company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Prêt introuvable.'; END IF;
    remaining:=greatest(0,loan.montant_total_du::bigint-loan.montant_rembourse);
    IF loan.statut NOT IN ('actif','rembourse') THEN RAISE EXCEPTION 'Ce prêt ne peut pas être remboursé ici.'; END IF;
    paid:=least(amount,remaining);
    IF account.solde<paid THEN RAISE EXCEPTION 'Solde insuffisant pour ce remboursement.'; END IF;
    IF paid>0 THEN
      UPDATE felitz_comptes SET solde=solde-paid WHERE id=account.id;
      INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'debit',paid,'Remboursement anticipé prêt '||loan.id);
    END IF;
    UPDATE prets_bancaires SET montant_rembourse=montant_rembourse+paid,
      statut=CASE WHEN paid=remaining THEN 'rembourse' ELSE statut END,
      rembourse_at=CASE WHEN paid=remaining THEN coalesce(rembourse_at,now()) ELSE rembourse_at END
      WHERE id=loan.id RETURNING * INTO loan;
    result:=jsonb_build_object('ok',true,'pret',to_jsonb(loan),'montantRembourse',paid,'resteARembourser',remaining-paid,
      'message',CASE WHEN remaining=paid THEN 'Prêt intégralement remboursé.' ELSE 'Remboursement enregistré.' END);
  END IF;
  INSERT INTO company_loan_operations(request_id,actor_id,company_id,loan_id,operation,input,result)
    VALUES(p_request,p_actor,p_company,loan.id,p_operation,p_input,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.collect_company_loan(p_loan uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE loan prets_bancaires%ROWTYPE; account felitz_comptes%ROWTYPE;
  elapsed integer; target bigint; due bigint; paid bigint; matured boolean; new_balance bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('flight-economy-settlement:v2',0));
  SELECT * INTO loan FROM prets_bancaires WHERE id=p_loan FOR UPDATE;
  IF NOT FOUND OR loan.statut<>'actif' THEN RETURN jsonb_build_object('paid',0); END IF;
  matured:=coalesce(now()>=loan.echeance_at,false);
  IF matured THEN target:=loan.montant_total_du;
  ELSIF loan.mode_remboursement='quotidien' THEN
    elapsed:=greatest(0,least(loan.duree_jours,floor(extract(epoch FROM (now()-loan.created_at))/86400)::integer));
    target:=round(loan.montant_total_du::numeric*elapsed/loan.duree_jours);
  ELSE RETURN jsonb_build_object('paid',0); END IF;
  due:=greatest(0,target-loan.montant_rembourse);
  IF due=0 THEN RETURN jsonb_build_object('paid',0); END IF;
  SELECT * INTO account FROM felitz_comptes WHERE compagnie_id=loan.compagnie_id AND type='entreprise' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte de la compagnie introuvable.'; END IF;
  -- Daily shortfalls are caught up later. At maturity the existing overdraft policy applies.
  paid:=CASE WHEN matured THEN due ELSE least(due,greatest(0,account.solde)) END;
  IF paid=0 THEN RETURN jsonb_build_object('paid',0,'arrears',due); END IF;
  UPDATE felitz_comptes SET solde=solde-paid WHERE id=account.id RETURNING solde INTO new_balance;
  INSERT INTO felitz_transactions(compte_id,type,montant,libelle) VALUES(account.id,'debit',paid,
    CASE WHEN matured THEN 'Échéance prêt ' ELSE 'Prélèvement quotidien prêt ' END||loan.id);
  UPDATE prets_bancaires SET montant_rembourse=montant_rembourse+paid,
    statut=CASE WHEN montant_rembourse+paid>=montant_total_du THEN 'rembourse' ELSE statut END,
    rembourse_at=CASE WHEN montant_rembourse+paid>=montant_total_du THEN now() ELSE rembourse_at END,
    decouvert_depuis=CASE WHEN matured AND new_balance<0 THEN coalesce(decouvert_depuis,now()) ELSE decouvert_depuis END
    WHERE id=loan.id;
  RETURN jsonb_build_object('paid',paid,'arrears',due-paid,'loan',loan.id,'balance',new_balance);
END $$;

CREATE OR REPLACE FUNCTION public.collect_due_company_loans()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; collected jsonb; logs jsonb:='[]'; failures integer:=0; processed integer:=0;
BEGIN
  FOR r IN SELECT id FROM prets_bancaires WHERE statut='actif'
    AND (echeance_at<=now() OR (mode_remboursement='quotidien' AND created_at<=now()-interval '24 hours'))
    ORDER BY echeance_at,id LOOP
    BEGIN
      collected:=collect_company_loan(r.id);
      IF (collected->>'paid')::bigint>0 THEN processed:=processed+1; END IF;
      logs:=logs||jsonb_build_array(collected);
    EXCEPTION WHEN OTHERS THEN
      failures:=failures+1;
      logs:=logs||jsonb_build_array(jsonb_build_object('loan',r.id,'error',SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('processed',processed,'failures',failures,'results',logs);
END $$;

-- Scheduled loans must never also be charged 30% of flight income.
-- Patch only the two known selectors, retaining all deployed settlement logic.
DO $migration$
DECLARE fn regprocedure; definition text; updated text; source text; replacement text;
BEGIN
  FOR fn,source,replacement IN SELECT * FROM (VALUES
    (to_regprocedure('public.settle_flight_economy(uuid)'),
     'FROM prets_bancaires WHERE compagnie_id=c.id AND statut=''actif'' ORDER BY id LIMIT 1 FOR UPDATE',
     'FROM prets_bancaires WHERE compagnie_id=c.id AND statut=''actif'' AND mode_remboursement=''vols'' ORDER BY id LIMIT 1 FOR UPDATE'),
    (to_regprocedure('public.settle_diverted_flight(uuid,bigint,bigint,bigint,uuid,uuid,uuid)'),
     'from public.prets_bancaires where compagnie_id=p.compagnie_id and statut=''actif'' for update',
     'from public.prets_bancaires where compagnie_id=p.compagnie_id and statut=''actif'' and mode_remboursement=''vols'' for update')
  ) patches(f,s,r) LOOP
    IF fn IS NOT NULL THEN
      definition:=pg_get_functiondef(fn);
      IF position(replacement IN definition)=0 THEN
        IF position(source IN definition)=0 THEN RAISE EXCEPTION 'Sélecteur de prêt à vérifier dans %',fn; END IF;
        updated:=replace(definition,source,replacement);
        EXECUTE updated;
      END IF;
    END IF;
  END LOOP;
END $migration$;

REVOKE ALL ON FUNCTION public.assert_company_loan_actor(uuid,uuid),public.company_loan_terms(numeric,numeric,text),
  public.company_loan_capital(uuid),public.company_loan_dashboard(uuid,uuid),
  public.manage_company_loan(uuid,uuid,text,uuid,jsonb),public.collect_company_loan(uuid),public.collect_due_company_loans()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_company_loan_actor(uuid,uuid),public.company_loan_terms(numeric,numeric,text),
  public.company_loan_capital(uuid),public.company_loan_dashboard(uuid,uuid),
  public.manage_company_loan(uuid,uuid,text,uuid,jsonb),public.collect_company_loan(uuid),public.collect_due_company_loans()
  TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
